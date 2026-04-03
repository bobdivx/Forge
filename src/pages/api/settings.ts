import type { APIRoute } from 'astro';
import { getAllConfig, setConfig } from '../../lib/config-db';
import type { ForgeConfig } from '../../lib/config-db';
import { readAppSettings } from '../../lib/auth';

export const GET: APIRoute = async () => {
  const config = await getAllConfig();
  const legacy = readAppSettings() as Partial<ForgeConfig>;
  const merged: ForgeConfig = {
    ...config,
    openclawToken:
      config.openclawToken || String(legacy.openclawToken || '').trim(),
    openclawGatewayUrl:
      config.openclawGatewayUrl || String(legacy.openclawGatewayUrl || '').trim(),
    githubToken: config.githubToken || String(legacy.githubToken || '').trim(),
    vercelToken: config.vercelToken || String(legacy.vercelToken || '').trim(),
    forgeReposRoot: config.forgeReposRoot || String((legacy as { forgeReposRoot?: string }).forgeReposRoot || '').trim(),
    dockerYamlDir: config.dockerYamlDir || String((legacy as { dockerYamlDir?: string }).dockerYamlDir || '').trim(),
    dockerAppDataDir: config.dockerAppDataDir || String((legacy as { dockerAppDataDir?: string }).dockerAppDataDir || '').trim(),
  };
  return new Response(JSON.stringify(merged), {
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
