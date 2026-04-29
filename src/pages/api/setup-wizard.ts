import type { APIRoute } from 'astro';
import { getAllConfig, setConfig } from '../../lib/config-db';
import type { ForgeConfig } from '../../lib/config-db';
import { readForgeSetupState } from '../../lib/forge-setup';
import { validateForgeReposRootForSave } from '../../lib/forge-repos-health';
import { inferZimaOSBackedPathDefaults } from '../../lib/zimaos-path-defaults';
import { randomBytes } from 'node:crypto';
import { probeZimaOSContainerPath } from '../../lib/zimaos-docker-mounts';
import fs from 'node:fs';

const SECRET_KEYS_NO_EMPTY_OVERWRITE: (keyof ForgeConfig)[] = [
  'githubWebhookSecret',
  'githubToken',
  'vercelToken',
  'forgeApiToken',
  'zimaosSshPassword',
];

function buildConfigPayload(data: Record<string, unknown>): Partial<ForgeConfig> {
  const payload: Partial<ForgeConfig> = {};
  const allowed: (keyof ForgeConfig)[] = [
    'forgePublicUrl',
    'zimaosContainerName',
    'zimaosRuntimeUrl',
    'zimaosAccessMode',
    'zimaosHost',
    'zimaosSshPort',
    'zimaosSshUser',
    'zimaosSshAuth',
    'zimaosSshKeyPath',
    'zimaosSshPassword',
    'zimaosContainerName',
    'zimaosGatewayUrl',
    'forgeApiToken',
    'ollamaUrl',
    'githubToken',
    'vercelToken',
    'githubWebhookSecret',
    'forgeReposRoot',
    'forgeReposRootAgent',
    'dockerYamlDir',
    'dockerAppDataDir',
  ];
  for (const key of allowed) {
    if (!(key in data)) continue;
    const val = String(data[key] ?? '').trim();
    if (SECRET_KEYS_NO_EMPTY_OVERWRITE.includes(key) && (val === '' || val === '••••••••')) continue;
    (payload as Record<string, string>)[key] = val;
  }
  return payload;
}

async function validateSetup(data: Record<string, unknown>) {
  const checks: Record<string, { ok: boolean; detail: string }> = {};
  const accessMode = String(data.zimaosAccessMode ?? 'local_docker').trim() || 'local_docker';
  const reposRoot = String(data.forgeReposRoot ?? '').trim();
  const yamlDir = String(data.dockerYamlDir ?? '').trim();
  const appDataDir = String(data.dockerAppDataDir ?? '').trim();
  const zimaosRuntimeUrl = String(data.zimaosRuntimeUrl ?? data.zimaosGatewayUrl ?? '').trim();
  const ollamaUrl = String(data.ollamaUrl ?? '').trim();
  const githubToken = String(data.githubToken ?? '').trim();

  const repoCheck = reposRoot ? validateForgeReposRootForSave(reposRoot) : { ok: false, error: 'Chemin apps vide.' };
  checks.appsRoot = {
    ok: repoCheck.ok,
    detail: repoCheck.ok ? `Racine apps valide: ${reposRoot}` : repoCheck.error || 'Racine apps invalide',
  };
  checks.mountPaths = {
    ok: Boolean(reposRoot && yamlDir && appDataDir),
    detail: reposRoot && yamlDir && appDataDir ? 'Chemins de montage renseignés.' : 'Chemins de montage incomplets.',
  };

  if (accessMode === 'remote_ssh') {
    const host = String(data.zimaosHost ?? '').trim();
    const sshUser = String(data.zimaosSshUser ?? '').trim();
    const sshPort = String(data.zimaosSshPort ?? '').trim() || '22';
    checks.appsRoot = {
      ok: Boolean(reposRoot),
      detail: reposRoot
        ? `Chemin apps distant configuré: ${reposRoot} (validation locale ignorée en mode SSH distant).`
        : 'Renseigner le chemin apps distant (ex: /media/GitHub).',
    };
    checks.zimaosAccessMode = { ok: true, detail: 'Mode distant SSH actif.' };
    checks.zimaosSsh = {
      ok: Boolean(host && sshUser),
      detail: host && sshUser ? `SSH prêt vers ${sshUser}@${host}:${sshPort}` : 'Renseigner hôte et utilisateur SSH.',
    };
    checks.dockerZimaos = {
      ok: true,
      detail: 'Vérification Docker locale ignorée (mode distant SSH).',
    };
    checks.mountVisibility = {
      ok: true,
      detail: 'Montages à vérifier sur l’hôte distant via SSH.',
    };
  } else {
    checks.zimaosAccessMode = { ok: true, detail: 'Mode local Docker actif.' };
    try {
      const probe = await probeZimaOSContainerPath({ pathToTest: reposRoot || '/' });
      checks.dockerZimaos = {
        ok: Boolean(probe.attempted && !probe.dockerError),
        detail: probe.dockerError || `Docker accessible, sandbox agents: ${probe.containerName || 'auto'}`,
      };
      checks.mountVisibility = {
        ok: probe.pathExistsInContainer || probe.likelyMountMatch,
        detail:
          probe.pathExistsInContainer || probe.likelyMountMatch
            ? 'Le dossier apps semble visible depuis le conteneur.'
            : 'Le dossier apps ne semble pas monté dans le conteneur.',
      };
    } catch (e: unknown) {
      checks.dockerZimaos = { ok: false, detail: e instanceof Error ? e.message : 'Probe Docker impossible' };
    }
  }

  if (zimaosRuntimeUrl) {
    try {
      const r = await fetch(`${zimaosRuntimeUrl.replace(/\/$/, '')}/health`, { signal: AbortSignal.timeout(2000) });
      checks.zimaosRuntime = {
        ok: r.ok,
        detail: r.ok ? `Runtime ZimaOS joignable (${r.status})` : `Runtime ZimaOS non valide (${r.status})`,
      };
    } catch (e: unknown) {
      checks.zimaosRuntime = { ok: false, detail: e instanceof Error ? e.message : 'Runtime ZimaOS injoignable' };
    }
  } else {
    checks.zimaosRuntime = { ok: false, detail: 'URL runtime ZimaOS non renseignée.' };
  }

  if (ollamaUrl) {
    try {
      const r = await fetch(`${ollamaUrl.replace(/\/$/, '')}/api/tags`, { signal: AbortSignal.timeout(2500) });
      checks.ollama = { ok: r.ok, detail: r.ok ? `Ollama joignable (${r.status})` : `Ollama erreur HTTP ${r.status}` };
    } catch (e: unknown) {
      checks.ollama = { ok: false, detail: e instanceof Error ? e.message : 'Ollama injoignable' };
    }
  } else {
    checks.ollama = { ok: false, detail: 'URL Ollama non renseignée.' };
  }

  checks.githubToken = {
    ok: githubToken.length > 0,
    detail: githubToken.length > 0 ? 'Jeton GitHub présent.' : 'Jeton GitHub absent (optionnel).',
  };

  return { ok: Object.values(checks).every((c) => c.ok || c.detail.includes('optionnel')), checks };
}

export const GET: APIRoute = async ({ locals, request }) => {
  if (!locals.user?.email) {
    return new Response(JSON.stringify({ error: 'Non authentifié' }), { status: 401 });
  }
  const state = await readForgeSetupState();
  const config = await getAllConfig();
  const inferred = await inferZimaOSBackedPathDefaults();
  const zimaosDefault =
    process.env.FORGE_ZIMAOS_RUNTIME_URL?.trim() ||
    process.env.ZIMAOS_GATEWAY_URL?.trim() ||
    (fs.existsSync('/.dockerenv') ? 'http://host.docker.internal:24190' : '');
  const requestHost = new URL(request.url).host;
  const hydrated = {
    ...config,
    zimaosRuntimeUrl: (config as Record<string, string>).zimaosRuntimeUrl || config.zimaosGatewayUrl || zimaosDefault || `http://${requestHost}`,
    forgeReposRoot: config.forgeReposRoot || inferred.forgeReposRoot || config.forgeReposRoot,
    dockerYamlDir: config.dockerYamlDir || inferred.dockerYamlDir || config.dockerYamlDir,
    dockerAppDataDir: config.dockerAppDataDir || inferred.dockerAppDataDir || config.dockerAppDataDir,
  };

  const sensitiveKeys = ['zimaosToken', 'zimaosSshPassword', 'githubToken', 'vercelToken', 'cloudflareToken', 'githubWebhookSecret', 'forgeApiToken'];
  for (const k of sensitiveKeys) {
    if ((hydrated as any)[k]) {
      (hydrated as any)[k] = '••••••••';
    }
  }

  return new Response(JSON.stringify({ state, config: hydrated }), {
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

  if (action === 'validate') {
    const result = await validateSetup(body);
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

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
    const current = await getAllConfig();
    if (!payload.forgeApiToken?.trim() && !current.forgeApiToken?.trim()) {
      payload.forgeApiToken = `forge_${randomBytes(24).toString('hex')}`;
    }
    if (!payload.forgePublicUrl?.trim() && !current.forgePublicUrl?.trim()) {
      try {
        const u = new URL(request.url);
        payload.forgePublicUrl = `${u.protocol}//${u.host}`;
      } catch {
        /* ignore */
      }
    }

    if (payload.zimaosRuntimeUrl && !payload.zimaosGatewayUrl) {
      payload.zimaosGatewayUrl = payload.zimaosRuntimeUrl;
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
