import type { APIRoute } from 'astro';
import { getAllConfig, setConfig } from '../../lib/config-db';
import type { ForgeConfig } from '../../lib/config-db';

export const GET: APIRoute = async () => {
  const config = await getAllConfig();
  return new Response(JSON.stringify(config), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

export const POST: APIRoute = async ({ request }) => {
  try {
    const data = await request.json();

    const payload: Partial<ForgeConfig> = {};
    const allowed: (keyof ForgeConfig)[] = [
      'openclawGatewayUrl', 'openclawToken',
      'githubToken', 'vercelToken',
      'forgeReposRoot', 'dockerYamlDir', 'dockerAppDataDir',
    ];
    for (const key of allowed) {
      if (key in data) payload[key] = String(data[key] ?? '').trim();
    }

    await setConfig(payload);

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: 'Échec de sauvegarde' }), { status: 500 });
  }
};
