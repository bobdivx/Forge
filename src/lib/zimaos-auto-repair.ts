import { execSync } from 'node:child_process';
import { getConfig, setConfig } from './config-db';
import { getZimaOSInfraClient } from './zimaos-infra-client';
import {
  getZimaOSGatewayBaseUrl,
  getZimaOSToken,
  getZimaOSGatewayCandidateBases,
  probeZimaOSGatewayRepairPair,
  readZimaOSLocalConfigFile,
} from './zimaos-gateway';
import { inferZimaOSBackedPathDefaults } from './zimaos-path-defaults';

export type ZimaOSAutoRepairTokenSource = 'file' | 'database' | 'env';

export type ZimaOSAutoRepairResult = {
  alreadyOk: boolean;
  repaired: boolean;
  winner?: { baseUrl: string; tokenSource: ZimaOSAutoRepairTokenSource };
  saved: {
    gatewayUrl: boolean;
    token: boolean;
    dockerAppDataDir: boolean;
    dockerYamlDir: boolean;
    forgeReposRoot: boolean;
  };
  warnings: string[];
  actions: string[];
  error?: string;
  probesTried: number;
  dockerRestart?: { ok: boolean; container?: string; error?: string };
};

function detectZimaOSContainerName(): string | null {
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
    return names.find((n) => n.toLowerCase().includes('zimaos')) ?? null;
  } catch {
    return null;
  }
}

/**
 * Diagnostique la connexion ZimaOS puis, si besoin, écrit URL + jeton (+ AppData) dans la table Config.
 * Respecte ZIMAOS_GATEWAY_URL / ZIMAOS_GATEWAY_TOKEN (env > base, non écrasées).
 */
export async function runZimaOSAutoRepair(options?: {
  restartDocker?: boolean;
}): Promise<ZimaOSAutoRepairResult> {
  const warnings: string[] = [];
  const actions: string[] = [];
  const saved = {
    gatewayUrl: false,
    token: false,
    dockerAppDataDir: false,
    dockerYamlDir: false,
    forgeReposRoot: false,
  };
  let probesTried = 0;
  let dockerRestart: ZimaOSAutoRepairResult['dockerRestart'];

  const envUrl = process.env.ZIMAOS_GATEWAY_URL?.trim() || '';
  const envTok = process.env.ZIMAOS_GATEWAY_TOKEN?.trim() || '';
  if (envUrl) warnings.push('ZIMAOS_GATEWAY_URL est défini : l’URL en base ne sera pas utilisée tant que la variable existe.');
  if (envTok) warnings.push('ZIMAOS_GATEWAY_TOKEN est défini : le jeton en base ne sera pas utilisé tant que la variable existe.');

  const baseCurrent = await getZimaOSGatewayBaseUrl();
  const tokenCurrent = await getZimaOSToken();
  const before = await probeZimaOSGatewayRepairPair(baseCurrent, tokenCurrent);
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

  const local = await readZimaOSLocalConfigFile();
  const dbTok = (await getConfig('zimaosToken')).trim();
  const tokenOrder: { token: string; source: ZimaOSAutoRepairTokenSource }[] = [];
  const seenTok = new Set<string>();
  const pushTok = (t: string, source: ZimaOSAutoRepairTokenSource) => {
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
      error: 'Aucun jeton connu (fichier zimaos.json, base Config ou ZIMAOS_GATEWAY_TOKEN).',
      probesTried,
    };
  }

  const bases = await getZimaOSGatewayCandidateBases();
  let winner: { baseUrl: string; token: string; tokenSource: ZimaOSAutoRepairTokenSource } | null = null;

  outer: for (const base of bases) {
    for (const { token, source } of tokenOrder) {
      probesTried += 1;
      const r = await probeZimaOSGatewayRepairPair(base, token);
      if (r.ok) {
        winner = { baseUrl: base.replace(/\/$/, ''), token, tokenSource: source };
        actions.push(
          `Combinaison valide : ${winner.baseUrl} (jeton : ${source === 'file' ? 'zimaos.json' : source === 'database' ? 'table Config' : 'variable d’environnement'}).`,
        );
        break outer;
      }
    }
  }

  if (!winner && options?.restartDocker) {
    const configured = (await getConfig('zimaosContainerName')).trim();
    const detected = detectZimaOSContainerName();
    const accessMode = (await getConfig('zimaosAccessMode')).trim() || 'local_docker';
    let remoteDetected = '';
    let remoteNames: string[] = [];
    if (accessMode === 'remote_ssh') {
      try {
        const infra = await getZimaOSInfraClient();
        const out = infra.exec('docker ps --format "{{.Names}}"');
        remoteNames = String(out)
          .split(/\r?\n/)
          .map((s) => s.trim())
          .filter(Boolean);
        remoteDetected =
          remoteNames.find((n) => /zimaos|openclaw|gateway/i.test(n)) ||
          remoteNames[0] ||
          '';
      } catch {
        remoteDetected = '';
        remoteNames = [];
      }
    }
    const configuredUsable =
      !configured ||
      accessMode !== 'remote_ssh' ||
      remoteNames.length === 0 ||
      remoteNames.includes(configured);
    const container = (configuredUsable ? configured : '') || remoteDetected || detected || '';
    if (container) {
      try {
        if (accessMode === 'remote_ssh') {
          const infra = await getZimaOSInfraClient();
          // Reset du circuit-breaker SSH avant action de réparation.
          await infra.testConnection();
          infra.exec(`docker restart ${container}`);
        } else {
          execSync(`docker restart ${container}`, {
            encoding: 'utf-8',
            timeout: 12_000,
            windowsHide: true,
          });
        }
        dockerRestart = { ok: true, container };
        actions.push(
          accessMode === 'remote_ssh'
            ? `Conteneur Docker distant redémarré via SSH : ${container}.`
            : `Conteneur Docker redémarré : ${container}.`,
        );
        outer2: for (const base of bases) {
          for (const { token, source } of tokenOrder) {
            probesTried += 1;
            const r2 = await probeZimaOSGatewayRepairPair(base, token);
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
      dockerRestart = { ok: false, error: 'Aucun conteneur ZimaOS détecté (nom vide).' };
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
    partial.zimaosGatewayUrl = winner.baseUrl;
    saved.gatewayUrl = true;
  } else {
    actions.push('URL non enregistrée en base (ZIMAOS_GATEWAY_URL actif).');
  }
  if (!envTok) {
    partial.zimaosToken = winner.token;
    saved.token = true;
  } else {
    actions.push('Jeton non enregistré en base (ZIMAOS_GATEWAY_TOKEN actif).');
  }

  const inferredPaths = await inferZimaOSBackedPathDefaults();
  if (inferredPaths.dockerAppDataDir) {
    partial.dockerAppDataDir = inferredPaths.dockerAppDataDir;
    saved.dockerAppDataDir = true;
    actions.push(`dockerAppDataDir défini depuis ZimaOS : ${partial.dockerAppDataDir}`);
  }
  if (inferredPaths.dockerYamlDir) {
    partial.dockerYamlDir = inferredPaths.dockerYamlDir;
    saved.dockerYamlDir = true;
    actions.push(`dockerYamlDir défini depuis ZimaOS : ${partial.dockerYamlDir}`);
  }
  if (inferredPaths.forgeReposRoot) {
    partial.forgeReposRoot = inferredPaths.forgeReposRoot;
    saved.forgeReposRoot = true;
    actions.push(`forgeReposRoot déduit des mounts ZimaOS : ${partial.forgeReposRoot}`);
  }

  if (Object.keys(partial).length) {
    await setConfig(partial as Parameters<typeof setConfig>[0]);
    actions.push('Paramètres Forge (Config) mis à jour.');
  }

  const verifyBase = envUrl ? envUrl.replace(/\/$/, '') : winner.baseUrl;
  const verifyTok = envTok || winner.token;
  const after = await probeZimaOSGatewayRepairPair(verifyBase, verifyTok);
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
