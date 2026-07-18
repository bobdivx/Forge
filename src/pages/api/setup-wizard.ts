import type { APIRoute } from 'astro';
import { getAllConfig, setConfig } from '../../lib/config-db';
import type { ForgeConfig } from '../../lib/config-db';
import { readForgeSetupState } from '../../lib/forge-setup';
import { validateForgeReposRootForSave } from '../../lib/forge-repos-health';

const SECRET_KEYS_NO_EMPTY_OVERWRITE: (keyof ForgeConfig)[] = [
  'githubWebhookSecret',
  'githubToken',
  'vercelToken',
  'openclawToken',
];

function buildConfigPayload(data: Record<string, unknown>): Partial<ForgeConfig> {
  const payload: Partial<ForgeConfig> = {};
  const allowed: (keyof ForgeConfig)[] = [
    'forgePublicUrl',
    'openclawContainerName',
    'openclawGatewayUrl',
    'openclawToken',
    'githubToken',
    'vercelToken',
    'githubWebhookSecret',
    'forgeReposRoot',
    'dockerYamlDir',
    'dockerAppDataDir',
  ];
  for (const key of allowed) {
    if (!(key in data)) continue;
    const val = String(data[key] ?? '').trim();
    if (SECRET_KEYS_NO_EMPTY_OVERWRITE.includes(key) && val === '') continue;
    (payload as Record<string, string>)[key] = val;
  }
  return payload;
}

export const GET: APIRoute = async ({ locals }) => {
  if (!locals.user?.email) {
    return new Response(JSON.stringify({ error: 'Non authentifié' }), { status: 401 });
  }
  const state = await readForgeSetupState();
  const config = await getAllConfig();
  return new Response(JSON.stringify({ state, config }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user?.email) {
    return new Response(JSON.stringify({ error: 'Non authentifié' }), { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const action = String(body?.action ?? '').trim().toLowerCase();

  if (action === 'skip') {
    await setConfig({ forgeSetupState: 'skipped' });
    return new Response(JSON.stringify({ ok: true, state: 'skipped' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (action === 'restart') {
    await setConfig({ forgeSetupState: 'pending' });
    return new Response(JSON.stringify({ ok: true, state: 'pending' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (action === 'finish') {
    const payload = buildConfigPayload(body);
    const rp = payload.forgeReposRoot?.trim();
    if (rp) {
      const check = validateForgeReposRootForSave(rp);
      if (!check.ok) {
        return new Response(JSON.stringify({ ok: false, error: check.error }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }
    await setConfig(payload);
    await setConfig({ forgeSetupState: 'done' });
    return new Response(JSON.stringify({ ok: true, state: 'done' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ error: 'action invalide (finish|skip|restart)' }), { status: 400 });
};
