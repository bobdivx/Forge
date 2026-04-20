import type { APIRoute } from 'astro';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  invokeOpenClawSessionsSend,
  invokeOpenClawAgentTask,
  invokeOpenClawV1ChatFallback,
  getOpenClawToken,
} from '../../lib/openclaw-gateway';

const MAX_MESSAGE = 120_000;
const execFileAsync = promisify(execFile);

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
  if (result.httpStatus === 404 || /sessions_send/i.test(String(result.error || ''))) {
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
        error: fallback3.error || fallback2.error || fallback.error || result.error,
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
    return new Response(JSON.stringify({ error: result.error, detail: result.detail }), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
