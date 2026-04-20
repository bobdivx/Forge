import type { APIRoute } from 'astro';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  invokeOpenClawSessionsSend,
  invokeOpenClawAgentTask,
  invokeOpenClawV1ChatFallback,
  getOpenClawToken,
  getOpenClawGatewayBaseUrl,
} from '../../lib/openclaw-gateway';
import { getConfig } from '../../lib/config-db';

const MAX_MESSAGE = 120_000;
const execFileAsync = promisify(execFile);

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
  if (/spawn\s+openclaw\s+enoent/i.test(s)) {
    return 'CLI openclaw indisponible sur le serveur Forge (fallback local non utilisable).';
  }
  return s.slice(0, 600);
}

function errorForStatus(httpStatus: number | undefined, fallback: string): string {
  if (httpStatus === 404) {
    return 'Gateway OpenClaw répond 404 : URL gateway incorrecte ou endpoint API non exposé par ce service.';
  }
  if (httpStatus != null && httpStatus >= 500) {
    return 'Gateway OpenClaw indisponible (5xx) — vérifiez reverse proxy, URL gateway et token.';
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
  curlTest: string;
  powershellScript: string;
  bashScript: string;
  json: string;
  docs?: string;
};

async function resolveOpenClawConfigPathHint(): Promise<string> {
  const appDataDir = (await getConfig('dockerAppDataDir')).trim() || 'C:\\DATA\\AppData';
  return `${appDataDir}/openclaw/openclaw.json`;
}

async function buildGatewayToolsRemediation(): Promise<GatewayRemediation> {
  const base = (await getOpenClawGatewayBaseUrl()).replace(/\/$/, '');
  const invokeEndpoint = `${base}/tools/invoke`;
  const configPath = await resolveOpenClawConfigPathHint();
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
    title: 'Activer les outils OpenClaw requis par Forge',
    endpoint: invokeEndpoint,
    configPath,
    where:
      `Dans le fichier de config OpenClaw (${configPath}), section "gateway.tools.allow", puis redémarrer le service gateway.`,
    instructions: [
      'Ouvrir la configuration du gateway OpenClaw.',
      `Modifier la section gateway.tools.allow utilisée par l’endpoint ${invokeEndpoint}.`,
      'Ajouter sessions_list, sessions_send et agents_invoke.',
      'Redémarrer le gateway OpenClaw.',
      'Note: ouvrir /tools/invoke dans le navigateur fait un GET et peut répondre "Method Not Allowed" (normal).',
      'Tester avec un POST JSON (curl ci-dessous) pour valider la disponibilité réelle.',
      'Revenir dans Forge > Discussion et renvoyer le message.',
    ],
    curlTest: [
      `curl -X POST '${invokeEndpoint}' \\`,
      "  -H 'Content-Type: application/json' \\",
      "  -H 'Accept: application/json' \\",
      "  -H 'X-Gateway-Token: <OPENCLAW_TOKEN>' \\",
      "  -H 'Authorization: Bearer <OPENCLAW_TOKEN>' \\",
      "  --data '{\"tool\":\"sessions_list\",\"action\":\"json\",\"args\":{\"limit\":1,\"messageLimit\":0}}'",
    ].join('\n'),
    powershellScript: [
      '$cfg = Get-Content -Raw "C:\\DATA\\AppData\\openclaw\\openclaw.json" | ConvertFrom-Json',
      'if (-not $cfg.gateway) { $cfg | Add-Member -NotePropertyName gateway -NotePropertyValue (@{}) }',
      'if (-not $cfg.gateway.tools) { $cfg.gateway | Add-Member -NotePropertyName tools -NotePropertyValue (@{}) }',
      '$cfg.gateway.tools.allow = @("sessions_list","sessions_send","agents_invoke")',
      '$cfg | ConvertTo-Json -Depth 50 | Set-Content "C:\\DATA\\AppData\\openclaw\\openclaw.json"',
      '# puis redemarrer le service/container openclaw gateway',
    ].join('\n'),
    bashScript: [
      "python3 - <<'PY'",
      'import json',
      "p='/DATA/AppData/openclaw/openclaw.json'",
      "cfg=json.load(open(p,'r',encoding='utf-8'))",
      "cfg.setdefault('gateway',{}).setdefault('tools',{})['allow']=['sessions_list','sessions_send','agents_invoke']",
      "json.dump(cfg,open(p,'w',encoding='utf-8'),indent=2,ensure_ascii=False)",
      "print('updated',p)",
      'PY',
      '# puis redemarrer le service/container openclaw gateway',
    ].join('\n'),
    json: jsonBlock,
    docs: 'https://openclaws.io/docs/gateway/tools-invoke-http-api',
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
  const token = await getOpenClawToken().catch(() => '');

  // 1) Essai CLI hôte
  try {
    await execFileAsync(
      'openclaw',
      ['task', '--agent', agentId, '--input', input],
      {
        timeout: 25_000,
        env: {
          ...process.env,
          ...(token ? { OPENCLAW_GATEWAY_TOKEN: token } : {}),
        },
      },
    );
    return { ok: true, via: 'host-cli' };
  } catch {
    // fallback docker exec
  }

  // 2) Essai docker exec <openclaw> openclaw task ...
  let container = 'openclaw';
  try {
    const { stdout } = await execFileAsync(
      'docker',
      ['ps', '--filter', 'name=openclaw', '--format', '{{.Names}}'],
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
      ['exec', container, 'openclaw', 'task', '--agent', agentId, '--input', input],
      { timeout: 30_000 },
    );
    return { ok: true, via: `docker-exec(${container})` };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg.slice(0, 500) };
  }
}

/**
 * Envoie un message utilisateur dans une session agent.
 * Priorité: sessions_send ; fallback: agents_invoke ; fallback final: v1/chat/completions.
 */
export const POST: APIRoute = async ({ request }) => {
  let body: { sessionKey?: string; message?: string; timeoutSeconds?: number };
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

  const result = await invokeOpenClawSessionsSend({
    sessionKey,
    message,
    timeoutSeconds,
    asyncDelivery: false,
  });

  if (result.ok) {
    return new Response(JSON.stringify(result.detail ?? { ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Fallback robuste : si sessions_send est bloqué par la gateway,
  // essayer agents_invoke avec l'identifiant agent.
  if (shouldRunFallbackChain(result.error, result.httpStatus)) {
    const fallback = await invokeOpenClawAgentTask({
      agentId: sessionKey,
      message,
    });
    if (fallback.ok) {
      return new Response(
        JSON.stringify({
          ok: true,
          via: 'agents_invoke_fallback',
          detail: fallback.detail ?? { accepted: true },
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }
    const fallback2 = await invokeOpenClawV1ChatFallback({
      agentId: sessionKey,
      message,
    });
    if (fallback2.ok) {
      return new Response(
        JSON.stringify({
          ok: true,
          via: fallback2.via,
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
          via: fallback3.via,
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

    return new Response(
      JSON.stringify({
        error: sanitizeErr(
          // Priorité aux erreurs gateway (racine), puis seulement aux fallbacks CLI locaux.
          fallback2.error || fallback.error || result.error || fallback3.error,
          errorForStatus(
            result.httpStatus,
            'Envoi OpenClaw refusé — vérifiez URL gateway, token et exposition des endpoints API.',
          ),
        ),
        ...(shouldAttachToolsRemediation(result.error, fallback.error, fallback2.error)
          ? { remediation: await buildGatewayToolsRemediation() }
          : {}),
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
        error: sanitizeErr(
          result.error,
          errorForStatus(
            result.httpStatus,
            'Envoi OpenClaw refusé — vérifiez URL gateway, token et exposition des endpoints API.',
          ),
        ),
        ...(shouldAttachToolsRemediation(result.error, null, null)
          ? { remediation: await buildGatewayToolsRemediation() }
          : {}),
        detail: result.detail,
      }),
      {
      status,
      headers: { 'Content-Type': 'application/json' },
      },
    );
  }
};
