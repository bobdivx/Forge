import type { APIRoute } from 'astro';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  invokeZimaOSSessionsSend,
  invokeZimaOSAgentTask,
  invokeZimaOSV1ChatFallback,
  getZimaOSToken,
  getZimaOSGatewayBaseUrl,
  resolveSessionsSendKey,
} from '../../lib/zimaos-gateway';
import { getConfig, getOllamaOriginResolved } from '../../lib/config-db';
import { attemptZimaOSPreRepair } from './_zimaos-pre-repair';

const MAX_MESSAGE = 120_000;
const execFileAsync = promisify(execFile);
const LEGACY_NOTICE =
  'Endpoint legacy: utilisez /api/forge-chat pour le flux conversationnel principal Forge-native.';

function extractReplyFromGatewayDetail(detail: unknown): string {
  if (detail == null || typeof detail !== 'object') return '';
  const d = detail as Record<string, unknown>;
  const direct = d.result;
  if (direct && typeof direct === 'object') {
    const r = direct as Record<string, unknown>;
    if (typeof r.reply === 'string' && r.reply.trim()) return r.reply;
    if (typeof r.output === 'string' && r.output.trim()) return r.output;
    if (typeof r.text === 'string' && r.text.trim()) return r.text;
  }
  const content = d.content;
  if (Array.isArray(content) && content.length > 0) {
    const first = content[0];
    if (first && typeof first === 'object') {
      const t = (first as Record<string, unknown>).text;
      if (typeof t === 'string' && t.trim()) return t;
    }
  }
  return '';
}

function looksLikeHtmlPayload(v: unknown): boolean {
  if (typeof v !== 'string') return false;
  const s = v.trim().toLowerCase();
  return s.startsWith('<!doctype html') || s.startsWith('<html');
}

function sanitizeErr(input: unknown, fallback: string): string {
  if (typeof input !== 'string') return fallback;
  const s = input.trim();
  if (!s) return fallback;
  if (looksLikeHtmlPayload(s)) return fallback;
  if (/spawn\s+docker\s+enoent/i.test(s)) {
    return 'Docker CLI indisponible sur le serveur Forge (fallback local non utilisable).';
  }
  if (/spawn\s+zimaos\s+enoent/i.test(s)) {
    return 'CLI zimaos indisponible sur le serveur Forge (fallback local non utilisable).';
  }
  return s.slice(0, 600);
}

function errorForStatus(httpStatus: number | undefined, fallback: string): string {
  if (httpStatus === 404) {
    return 'Gateway ZimaOS répond 404 : URL gateway incorrecte ou endpoint API non exposé par ce service.';
  }
  if (httpStatus != null && httpStatus >= 500) {
    return 'Gateway ZimaOS indisponible (5xx) — vérifiez reverse proxy, URL gateway et token.';
  }
  return fallback;
}

function shouldRunFallbackChain(error: unknown, httpStatus?: number): boolean {
  const s = String(error || '').toLowerCase();
  if (httpStatus === 404) return true;
  if (httpStatus != null && httpStatus >= 500) return true;
  return (
    s.includes('sessions_send') ||
    s.includes('tool not available') ||
    s.includes('bad gateway') ||
    s.includes('gateway http 5')
  );
}

type GatewayRemediation = {
  title: string;
  endpoint: string;
  configPath: string;
  where: string;
  instructions: string[];
  zimaosPrompt: string;
  curlTest: string;
  powershellScript: string;
  bashScript: string;
  json: string;
  docs?: string;
};

async function resolveZimaOSConfigPathHint(): Promise<string> {
  const appDataDir = (await getConfig('dockerAppDataDir')).trim() || 'C:\\DATA\\AppData';
  return `${appDataDir}/zimaos/zimaos.json`;
}

async function buildGatewayToolsRemediation(): Promise<GatewayRemediation> {
  const base = (await getZimaOSGatewayBaseUrl()).replace(/\/$/, '');
  const invokeEndpoint = `${base}/tools/invoke`;
  const configPath = await resolveZimaOSConfigPathHint();
  const zimaosPrompt = [
    'Applique cette correction de configuration ZimaOS gateway:',
    `1) Ouvre le fichier ${configPath}`,
    '2) Mets gateway.tools.allow avec sessions_list, sessions_send, agents_invoke',
    "3) Sauvegarde le fichier puis redémarre le service gateway ZimaOS",
    `4) Vérifie ensuite avec un POST sur ${invokeEndpoint} (tool=sessions_list)`,
    '5) Confirme quand c’est OK',
    '',
    'JSON cible:',
  ].join('\n');
  const jsonBlock = JSON.stringify(
    {
      gateway: {
        tools: {
          allow: ['sessions_list', 'sessions_send', 'agents_invoke'],
        },
      },
    },
    null,
    2,
  );
  return {
    title: 'Activer les outils ZimaOS requis par Forge',
    endpoint: invokeEndpoint,
    configPath,
    where:
      `Dans le fichier de config ZimaOS (${configPath}), section "gateway.tools.allow", puis redémarrer le service gateway.`,
    instructions: [
      'Ouvrir la configuration du gateway ZimaOS.',
      `Modifier la section gateway.tools.allow utilisée par l’endpoint ${invokeEndpoint}.`,
      'Ajouter sessions_list, sessions_send et agents_invoke.',
      'Redémarrer le gateway ZimaOS.',
      'Note: ouvrir /tools/invoke dans le navigateur fait un GET et peut répondre "Method Not Allowed" (normal).',
      'Tester avec un POST JSON (curl ci-dessous) pour valider la disponibilité réelle.',
      'Revenir dans Forge > Discussion et renvoyer le message.',
    ],
    zimaosPrompt: `${zimaosPrompt}\n${jsonBlock}`,
    curlTest: [
      `curl -X POST '${invokeEndpoint}' \\`,
      "  -H 'Content-Type: application/json' \\",
      "  -H 'Accept: application/json' \\",
      "  -H 'X-Gateway-Token: <ZIMAOS_TOKEN>' \\",
      "  -H 'Authorization: Bearer <ZIMAOS_TOKEN>' \\",
      "  --data '{\"tool\":\"sessions_list\",\"action\":\"json\",\"args\":{\"limit\":1,\"messageLimit\":0}}'",
    ].join('\n'),
    powershellScript: [
      '$cfg = Get-Content -Raw "C:\\DATA\\AppData\\zimaos\\zimaos.json" | ConvertFrom-Json',
      'if (-not $cfg.gateway) { $cfg | Add-Member -NotePropertyName gateway -NotePropertyValue (@{}) }',
      'if (-not $cfg.gateway.tools) { $cfg.gateway | Add-Member -NotePropertyName tools -NotePropertyValue (@{}) }',
      '$cfg.gateway.tools.allow = @("sessions_list","sessions_send","agents_invoke")',
      '$cfg | ConvertTo-Json -Depth 50 | Set-Content "C:\\DATA\\AppData\\zimaos\\zimaos.json"',
      '# puis redemarrer le service/container zimaos gateway',
    ].join('\n'),
    bashScript: [
      "python3 - <<'PY'",
      'import json',
      "p='/DATA/AppData/zimaos/zimaos.json'",
      "cfg=json.load(open(p,'r',encoding='utf-8'))",
      "cfg.setdefault('gateway',{}).setdefault('tools',{})['allow']=['sessions_list','sessions_send','agents_invoke']",
      "json.dump(cfg,open(p,'w',encoding='utf-8'),indent=2,ensure_ascii=False)",
      "print('updated',p)",
      'PY',
      '# puis redemarrer le service/container zimaos gateway',
    ].join('\n'),
    json: jsonBlock,
    docs: 'https://zimaoss.io/docs/gateway/tools-invoke-http-api',
  };
}

function shouldAttachToolsRemediation(primary: unknown, fallback1: unknown, fallback2: unknown): boolean {
  const all = [primary, fallback1, fallback2]
    .map((x) => String(x || '').toLowerCase())
    .join(' | ');
  return (
    all.includes('tool not available: sessions_send') ||
    all.includes('tool not available: agents_invoke') ||
    all.includes('sessions_send indisponible via http')
  );
}

async function invokeDirectiveViaCli(agentId: string, message: string): Promise<{
  ok: boolean;
  via?: string;
  error?: string;
}> {
  const input = String(message || '').slice(0, MAX_MESSAGE);
  const token = await getZimaOSToken().catch(() => '');

  // 1) Essai CLI hôte
  try {
    await execFileAsync(
      'zimaos',
      ['task', '--agent', agentId, '--input', input],
      {
        timeout: 25_000,
        env: {
          ...process.env,
          ...(token ? { ZIMAOS_GATEWAY_TOKEN: token } : {}),
        },
      },
    );
    return { ok: true, via: 'host-cli' };
  } catch {
    // fallback docker exec
  }

  // 2) Essai docker exec <zimaos> zimaos task ...
  let container = 'zimaos';
  try {
    const { stdout } = await execFileAsync(
      'docker',
      ['ps', '--filter', 'name=zimaos', '--format', '{{.Names}}'],
      { timeout: 6_000 },
    );
    const found = String(stdout || '')
      .split('\n')
      .map((s) => s.trim())
      .find(Boolean);
    if (found) container = found;
  } catch {
    // keep default name
  }

  try {
    await execFileAsync(
      'docker',
      ['exec', container, 'zimaos', 'task', '--agent', agentId, '--input', input],
      { timeout: 30_000 },
    );
    return { ok: true, via: `docker-exec(${container})` };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg.slice(0, 500) };
  }
}

async function invokeOllamaDirect(message: string, modelHint?: string): Promise<{
  ok: boolean;
  via?: string;
  reply?: string;
  error?: string;
}> {
  async function resolveAvailableModel(origin: string, preferred: string): Promise<string> {
    try {
      const r = await fetch(`${origin}/api/tags`, { signal: AbortSignal.timeout(15_000) });
      if (!r.ok) return preferred;
      const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
      const names = (Array.isArray(j.models) ? (j.models as Array<Record<string, unknown>>) : [])
        .map((m) => String(m.name || m.model || '').trim())
        .filter(Boolean);
      if (!names.length) return preferred;
      if (names.includes(preferred)) return preferred;
      for (const c of ['qwen3-coder:30b', 'llama3.2:latest', 'qwen2.5:7b', 'gemma4:latest']) {
        if (names.includes(c)) return c;
      }
      return names[0];
    } catch {
      return preferred;
    }
  }
  const origin = (await getOllamaOriginResolved()).replace(/\/$/, '');
  if (!origin) return { ok: false, error: 'URL Ollama non configurée' };
  const preferredLanguage = (await getConfig('agentPreferredLanguage')).trim() || 'fr';
  const globalRules = (await getConfig('agentGlobalBuildRules')).trim();
  const langInstruction =
    preferredLanguage === 'en'
      ? 'Always answer in English.'
      : preferredLanguage === 'fr_en'
        ? 'Answer in French first, then provide an English version.'
        : 'Toujours repondre en francais.';
  const preferredModel =
    String(modelHint || '').trim() ||
    process.env.OLLAMA_MODEL?.trim() ||
    'llama3.2:latest';
  const chosenModel = await resolveAvailableModel(origin, preferredModel);
  try {
    const res = await fetch(`${origin}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: chosenModel,
        stream: false,
        messages: [
          { role: 'system', content: `${langInstruction}\n\n${globalRules}`.trim() },
          { role: 'user', content: message.slice(0, MAX_MESSAGE) },
        ],
      }),
      signal: AbortSignal.timeout(45_000),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok && res.status === 404) {
      const genRes = await fetch(`${origin}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: chosenModel,
          stream: false,
          prompt: `${langInstruction}\n\n${globalRules}\n\n${message.slice(0, MAX_MESSAGE)}`.trim(),
        }),
        signal: AbortSignal.timeout(45_000),
      });
      const gen = (await genRes.json().catch(() => ({}))) as Record<string, unknown>;
      if (genRes.ok) {
        const reply = typeof gen.response === 'string' ? gen.response.trim() : '';
        return { ok: true, via: `ollama-generate(${chosenModel})`, reply: reply || 'Réponse Ollama reçue.' };
      }
      if (genRes.status === 404) {
        const v1Res = await fetch(`${origin}/v1/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: chosenModel,
            messages: [
              { role: 'system', content: `${langInstruction}\n\n${globalRules}`.trim() },
              { role: 'user', content: message.slice(0, MAX_MESSAGE) },
            ],
          }),
          signal: AbortSignal.timeout(45_000),
        });
        const v1 = (await v1Res.json().catch(() => ({}))) as Record<string, unknown>;
        if (v1Res.ok) {
          const choices = Array.isArray(v1.choices) ? (v1.choices as Array<Record<string, unknown>>) : [];
          const reply =
            typeof choices[0]?.message === 'object'
              ? String((choices[0].message as Record<string, unknown>).content || '').trim()
              : '';
          return { ok: true, via: `openai-chat(${chosenModel})`, reply: reply || 'Réponse Ollama reçue.' };
        }
      }
      return { ok: false, error: `Ollama HTTP ${genRes.status}` };
    }
    if (!res.ok) {
      return { ok: false, error: `Ollama HTTP ${res.status}` };
    }
    const reply =
      typeof (data.message as Record<string, unknown> | undefined)?.content === 'string'
        ? String((data.message as Record<string, unknown>).content).trim()
        : '';
    return { ok: true, via: `ollama-chat(${chosenModel})`, reply: reply || 'Réponse Ollama reçue.' };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Envoie un message utilisateur dans une session agent.
 * Priorité: sessions_send ; fallback: agents_invoke ; fallback final: v1/chat/completions.
 */
export const POST: APIRoute = async ({ request }) => {
  let body: { sessionKey?: string; message?: string; timeoutSeconds?: number; modelHint?: string };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'JSON invalide' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const sessionKey = String(body.sessionKey || '').trim();
  const message = String(body.message || '').trim();
  if (!sessionKey || !message) {
    return new Response(JSON.stringify({ error: 'sessionKey et message requis' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if (message.length > MAX_MESSAGE) {
    return new Response(JSON.stringify({ error: 'Message trop long' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const timeoutSeconds =
    typeof body.timeoutSeconds === 'number' && body.timeoutSeconds >= 0 && body.timeoutSeconds <= 600
      ? Math.floor(body.timeoutSeconds)
      : 120;
  const modelHint = String(body.modelHint || '').trim() || undefined;

  const isSwarmCommand = /\[FORGE_SWARM_COMMAND\]/i.test(message);
  let preRepair: { attempted: boolean; ok: boolean; note?: string; error?: string } | undefined;
  if (isSwarmCommand) {
    preRepair = await attemptZimaOSPreRepair('directive-swarm-command');
  }

  const resolvedSessionKey =
    (await resolveSessionsSendKey(undefined, [sessionKey]).catch(() => null)) || sessionKey;

  let result = await invokeZimaOSSessionsSend({
    sessionKey: resolvedSessionKey,
    message,
    timeoutSeconds,
    asyncDelivery: false,
  });

  // Même hors commande swarm, on tente une auto-réparation si la chaîne native échoue
  // puis on retente sessions_send une fois avant les fallbacks.
  if (!result.ok && shouldRunFallbackChain(result.error, result.httpStatus)) {
    if (!preRepair?.attempted) {
      preRepair = await attemptZimaOSPreRepair('directive-native-repair');
    }
    if (preRepair?.ok) {
      const retriedSessionKey =
        (await resolveSessionsSendKey(undefined, [resolvedSessionKey, sessionKey]).catch(() => null)) ||
        resolvedSessionKey;
      const retry = await invokeZimaOSSessionsSend({
        sessionKey: retriedSessionKey,
        message,
        timeoutSeconds,
        asyncDelivery: false,
      });
      if (retry.ok) {
        const reply = extractReplyFromGatewayDetail(retry.detail);
        return new Response(
          JSON.stringify({
            ok: true,
          legacy: true,
          notice: LEGACY_NOTICE,
            via: 'sessions_send_after_repair',
            preRepair,
            routedSessionKey: retriedSessionKey,
            result: reply ? { status: 'completed', reply } : { status: 'accepted' },
            detail: retry.detail ?? { ok: true },
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        );
      }
      result = retry;
    }
  }

  if (result.ok) {
    const reply = extractReplyFromGatewayDetail(result.detail);
    return new Response(
      JSON.stringify({
        ok: true,
        legacy: true,
        notice: LEGACY_NOTICE,
        via: 'sessions_send',
        preRepair,
        routedSessionKey: resolvedSessionKey,
        result: reply ? { status: 'completed', reply } : { status: 'accepted' },
        detail: result.detail ?? { ok: true },
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }

  // Fallback robuste : si sessions_send est bloqué par la gateway,
  // essayer agents_invoke avec l'identifiant agent.
  if (shouldRunFallbackChain(result.error, result.httpStatus)) {
    const fallback = await invokeZimaOSAgentTask({
      agentId: sessionKey,
      message,
    });
    if (fallback.ok) {
      return new Response(
        JSON.stringify({
          ok: true,
          legacy: true,
          notice: LEGACY_NOTICE,
          via: 'agents_invoke_fallback',
          preRepair,
          routedSessionKey: resolvedSessionKey,
          detail: fallback.detail ?? { accepted: true },
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }
    const fallback2 = await invokeZimaOSV1ChatFallback({
      agentId: sessionKey,
      message,
    });
    if (fallback2.ok) {
      return new Response(
        JSON.stringify({
          ok: true,
          legacy: true,
          notice: LEGACY_NOTICE,
          via: fallback2.via,
          preRepair,
          routedSessionKey: resolvedSessionKey,
          result: {
            status: 'completed',
            reply:
              (() => {
                const choices = (fallback2.detail as { choices?: unknown } | undefined)?.choices;
                if (!Array.isArray(choices) || choices.length === 0) return '';
                const first = choices[0] as { message?: { content?: unknown } } | undefined;
                return typeof first?.message?.content === 'string' ? first.message.content : '';
              })(),
          },
          detail: { sessionsSend: result.detail, agentsInvoke: fallback.detail },
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }

    const fallback3 = await invokeDirectiveViaCli(sessionKey, message);
    if (fallback3.ok) {
      return new Response(
        JSON.stringify({
          ok: true,
          legacy: true,
          notice: LEGACY_NOTICE,
          via: fallback3.via,
          preRepair,
          routedSessionKey: resolvedSessionKey,
          result: { status: 'accepted' },
          detail: {
            sessionsSend: result.detail,
            agentsInvoke: fallback.detail,
            chatCompletion: fallback2.detail,
          },
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }

    const fallback4 = await invokeOllamaDirect(message, modelHint);
    if (fallback4.ok) {
      return new Response(
        JSON.stringify({
          ok: true,
          legacy: true,
          notice: LEGACY_NOTICE,
          via: fallback4.via,
          preRepair,
          routedSessionKey: resolvedSessionKey,
          result: { status: 'completed', reply: fallback4.reply || '' },
          detail: {
            sessionsSend: result.detail,
            agentsInvoke: fallback.detail,
            chatCompletion: fallback2.detail,
            cli: fallback3,
          },
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }

    return new Response(
      JSON.stringify({
        legacy: true,
        notice: LEGACY_NOTICE,
        error: sanitizeErr(
          // Priorité aux erreurs gateway (racine), puis seulement aux fallbacks CLI locaux.
          fallback2.error || fallback.error || result.error || fallback3.error || fallback4.error,
          errorForStatus(
            result.httpStatus,
            'Envoi ZimaOS refusé — vérifiez URL gateway, token et exposition des endpoints API.',
          ),
        ),
        ...(shouldAttachToolsRemediation(result.error, fallback.error, fallback2.error)
          ? { remediation: await buildGatewayToolsRemediation() }
          : {}),
        preRepair,
        detail: {
          sessionsSend: result.detail,
          agentsInvoke: fallback.detail,
          chatCompletion: fallback2.detail,
        },
      }),
      {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }

  {
    const status = 502;
    return new Response(
      JSON.stringify({
        legacy: true,
        notice: LEGACY_NOTICE,
        error: sanitizeErr(
          result.error,
          errorForStatus(
            result.httpStatus,
            'Envoi ZimaOS refusé — vérifiez URL gateway, token et exposition des endpoints API.',
          ),
        ),
        ...(shouldAttachToolsRemediation(result.error, null, null)
          ? { remediation: await buildGatewayToolsRemediation() }
          : {}),
        preRepair,
        detail: result.detail,
      }),
      {
      status,
      headers: { 'Content-Type': 'application/json' },
      },
    );
  }
};
