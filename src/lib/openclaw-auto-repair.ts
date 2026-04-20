import { execSync } from 'node:child_process';
import { getConfig, setConfig } from './config-db';
import {
  getOpenClawGatewayBaseUrl,
  getOpenClawToken,
  getOpenClawGatewayCandidateBases,
  probeOpenClawGatewayRepairPair,
  readOpenClawLocalConfigFile,
} from './openclaw-gateway';

export type OpenClawAutoRepairTokenSource = 'file' | 'database' | 'env';

export type OpenClawAutoRepairResult = {
  alreadyOk: boolean;
  repaired: boolean;
  winner?: { baseUrl: string; tokenSource: OpenClawAutoRepairTokenSource };
  saved: { gatewayUrl: boolean; token: boolean; dockerAppDataDir: boolean };
  warnings: string[];
  actions: string[];
  error?: string;
  probesTried: number;
  dockerRestart?: { ok: boolean; container?: string; error?: string };
};

function inferDockerAppDataDirFromOpenclawPath(configPath: string): string | null {
  const norm = configPath.replace(/\\/g, '/');
  const lower = norm.toLowerCase();
  const idx = lower.lastIndexOf('/openclaw/openclaw.json');
  if (idx <= 0) return null;
  return norm.slice(0, idx).replace(/\/$/, '') || null;
}

function detectOpenClawContainerName(): string | null {
  try {
    const out = execSync('docker ps --format "{{.Names}}"', {
      encoding: 'utf-8',
      timeout: 2500,
      windowsHide: true,
    });
    const names = out
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    return names.find((n) => n.toLowerCase().includes('openclaw')) ?? null;
  } catch {
    return null;
  }
}

/**
 * Diagnostique la connexion OpenClaw puis, si besoin, écrit URL + jeton (+ AppData) dans la table Config.
 * Respecte OPENCLAW_GATEWAY_URL / OPENCLAW_GATEWAY_TOKEN (env > base, non écrasées).
 */
export async function runOpenClawAutoRepair(options?: {
  restartDocker?: boolean;
}): Promise<OpenClawAutoRepairResult> {
  const warnings: string[] = [];
  const actions: string[] = [];
  const saved = { gatewayUrl: false, token: false, dockerAppDataDir: false };
  let probesTried = 0;
  let dockerRestart: OpenClawAutoRepairResult['dockerRestart'];

  const envUrl = process.env.OPENCLAW_GATEWAY_URL?.trim() || '';
  const envTok = process.env.OPENCLAW_GATEWAY_TOKEN?.trim() || '';
  if (envUrl) warnings.push('OPENCLAW_GATEWAY_URL est défini : l’URL en base ne sera pas utilisée tant que la variable existe.');
  if (envTok) warnings.push('OPENCLAW_GATEWAY_TOKEN est défini : le jeton en base ne sera pas utilisé tant que la variable existe.');

  const baseCurrent = await getOpenClawGatewayBaseUrl();
  const tokenCurrent = await getOpenClawToken();
  const before = await probeOpenClawGatewayRepairPair(baseCurrent, tokenCurrent);
  probesTried += 1;
  if (before.ok) {
    return {
      alreadyOk: true,
      repaired: false,
      saved,
      warnings,
      actions: ['La passerelle répond déjà (/health + sessions_list) avec la configuration actuelle.'],
      probesTried,
    };
  }

  actions.push(
    `État initial : ${before.error || 'gateway injoignable'} (URL résolue : ${baseCurrent}).`,
  );

  const local = await readOpenClawLocalConfigFile();
  const dbTok = (await getConfig('openclawToken')).trim();
  const tokenOrder: { token: string; source: OpenClawAutoRepairTokenSource }[] = [];
  const seenTok = new Set<string>();
  const pushTok = (t: string, source: OpenClawAutoRepairTokenSource) => {
    const k = t.trim();
    if (!k || seenTok.has(k)) return;
    seenTok.add(k);
    tokenOrder.push({ token: k, source });
  };
  pushTok(local?.gatewayToken || '', 'file');
  pushTok(dbTok, 'database');
  pushTok(envTok, 'env');

  if (!tokenOrder.length) {
    return {
      alreadyOk: false,
      repaired: false,
      saved,
      warnings,
      actions,
      error: 'Aucun jeton connu (fichier openclaw.json, base Config ou OPENCLAW_GATEWAY_TOKEN).',
      probesTried,
    };
  }

  const bases = await getOpenClawGatewayCandidateBases();
  let winner: { baseUrl: string; token: string; tokenSource: OpenClawAutoRepairTokenSource } | null = null;

  outer: for (const base of bases) {
    for (const { token, source } of tokenOrder) {
      probesTried += 1;
      const r = await probeOpenClawGatewayRepairPair(base, token);
      if (r.ok) {
        winner = { baseUrl: base.replace(/\/$/, ''), token, tokenSource: source };
        actions.push(
          `Combinaison valide : ${winner.baseUrl} (jeton : ${source === 'file' ? 'openclaw.json' : source === 'database' ? 'table Config' : 'variable d’environnement'}).`,
        );
        break outer;
      }
    }
  }

  if (!winner && options?.restartDocker) {
    const configured = (await getConfig('openclawContainerName')).trim();
    const detected = detectOpenClawContainerName();
    const container = configured || detected || '';
    if (container) {
      try {
        execSync(`docker restart ${container}`, {
          encoding: 'utf-8',
          timeout: 12_000,
          windowsHide: true,
        });
        dockerRestart = { ok: true, container };
        actions.push(`Conteneur Docker redémarré : ${container}.`);
        outer2: for (const base of bases) {
          for (const { token, source } of tokenOrder) {
            probesTried += 1;
            const r2 = await probeOpenClawGatewayRepairPair(base, token);
            if (r2.ok) {
              winner = { baseUrl: base.replace(/\/$/, ''), token, tokenSource: source };
              actions.push(`Après redémarrage : ${winner.baseUrl} répond.`);
              break outer2;
            }
          }
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        dockerRestart = { ok: false, container, error: msg };
        actions.push(`Échec docker restart (${container}) : ${msg}`);
      }
    } else {
      dockerRestart = { ok: false, error: 'Aucun conteneur OpenClaw détecté (nom vide).' };
      actions.push('Redémarrage Docker demandé mais aucun nom de conteneur (réglages + docker ps).');
    }
  }

  if (!winner) {
    return {
      alreadyOk: false,
      repaired: false,
      saved,
      warnings,
      actions,
      error: 'Aucune URL + jeton testés ne répond correctement au gateway.',
      probesTried,
      dockerRestart,
    };
  }

  const partial: Record<string, string> = {};
  if (!envUrl) {
    partial.openclawGatewayUrl = winner.baseUrl;
    saved.gatewayUrl = true;
  } else {
    actions.push('URL non enregistrée en base (OPENCLAW_GATEWAY_URL actif).');
  }
  if (!envTok) {
    partial.openclawToken = winner.token;
    saved.token = true;
  } else {
    actions.push('Jeton non enregistré en base (OPENCLAW_GATEWAY_TOKEN actif).');
  }

  const appDataDb = (await getConfig('dockerAppDataDir')).trim();
  const inferred = local?.path ? inferDockerAppDataDirFromOpenclawPath(local.path) : null;
  if (!appDataDb && inferred) {
    partial.dockerAppDataDir = inferred;
    saved.dockerAppDataDir = true;
    actions.push(`dockerAppDataDir défini depuis openclaw.json : ${partial.dockerAppDataDir}`);
  }

  if (Object.keys(partial).length) {
    await setConfig(partial as Parameters<typeof setConfig>[0]);
    actions.push('Paramètres Forge (Config) mis à jour.');
  }

  const verifyBase = envUrl ? envUrl.replace(/\/$/, '') : winner.baseUrl;
  const verifyTok = envTok || winner.token;
  const after = await probeOpenClawGatewayRepairPair(verifyBase, verifyTok);
  probesTried += 1;

  if (!after.ok) {
    return {
      alreadyOk: false,
      repaired: false,
      winner: { baseUrl: winner.baseUrl, tokenSource: winner.tokenSource },
      saved,
      warnings,
      actions,
      error: after.error || 'Après sauvegarde, la sonde échoue encore (vérifiez les variables d’environnement).',
      probesTried,
      dockerRestart,
    };
  }

  return {
    alreadyOk: false,
    repaired: !before.ok && after.ok,
    winner: { baseUrl: winner.baseUrl, tokenSource: winner.tokenSource },
    saved,
    warnings,
    actions,
    probesTried,
    dockerRestart,
  };
}
