import type { APIRoute } from 'astro';
import { getAllConfig, setConfig } from '../../lib/config-db';
import type { ForgeConfig } from '../../lib/config-db';
import { validateForgeReposRootForSave } from '../../lib/forge-repos-health';

export const GET: APIRoute = async () => {
  const config = await getAllConfig();
  return new Response(JSON.stringify(config), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

/** Ne pas écraser en base si le client envoie une chaîne vide (onglet Infra / OpenClaw envoie tout le state ; champs secrets souvent vides côté UI). */
const SECRET_KEYS_NO_EMPTY_OVERWRITE: (keyof ForgeConfig)[] = [
  'githubWebhookSecret',
  'githubToken',
  'vercelToken',
  'openclawToken',
];

export const POST: APIRoute = async ({ request }) => {
  try {
    const data = await request.json();

    const payload: Partial<ForgeConfig> = {};
    const allowed: (keyof ForgeConfig)[] = [
      'forgePublicUrl',
      'openclawContainerName',
      'openclawGatewayUrl',
      'openclawToken',
      'ollamaUrl',
      'githubToken', 'vercelToken', 'githubWebhookSecret',
      'forgeReposRoot', 'dockerYamlDir', 'dockerAppDataDir',
      'forgeReposRootAgent',
    ];
    for (const key of allowed) {
      if (!(key in data)) continue;
      const val = String(data[key] ?? '').trim();
      if (SECRET_KEYS_NO_EMPTY_OVERWRITE.includes(key) && val === '') continue;
      if (key === 'forgeReposRoot' && val !== '') {
        const check = validateForgeReposRootForSave(val);
        if (!check.ok) {
          return new Response(JSON.stringify({ ok: false, error: check.error }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          });
        }
      }
      payload[key] = val;
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
