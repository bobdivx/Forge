/**
 * Installation d'outils selon l'hôte (Phase 3).
 *
 * Détecte la plateforme via `forge-host-context` et choisit le bon
 * gestionnaire de paquets : winget/scoop sur Windows, apt/apk dans un
 * conteneur Linux, brew sur macOS, plus les écosystèmes langages
 * (npm -g, pip, cargo).
 */
import { getHostContext } from './forge-host-context';
import { getZimaOSInfraClient } from './forge-infra-client';

export type InstallManager = 'auto' | 'winget' | 'scoop' | 'apt' | 'apk' | 'brew' | 'npm' | 'pip' | 'cargo';

export type InstallResult = {
  ok: boolean;
  manager: InstallManager;
  command: string;
  output?: string;
  error?: string;
};

function chooseManager(pkg: string, manager: InstallManager): InstallManager {
  if (manager !== 'auto') return manager;
  const lower = pkg.toLowerCase();
  // Heuristique : préfixes courants par écosystème.
  if (/^@?[a-z0-9_\-./]+@/.test(lower) || lower.startsWith('@')) return 'npm';
  if (/^[a-z0-9_\-]+==[0-9]/.test(lower)) return 'pip';

  const ctx = getHostContext();
  if (ctx.kind === 'local_windows') return 'winget';
  if (ctx.kind === 'local_macos') return 'brew';
  if (ctx.kind === 'container_linux' || ctx.kind === 'local_linux') {
    // Détection apt vs apk : on testera à l'exécution si nécessaire ; par défaut apt
    return 'apt';
  }
  return 'npm';
}

function buildInstallCommand(pkg: string, manager: InstallManager): string {
  switch (manager) {
    case 'winget':
      return `winget install --silent --accept-source-agreements --accept-package-agreements --id "${pkg}"`;
    case 'scoop':
      return `scoop install "${pkg}"`;
    case 'apt':
      // -y : non-interactif ; -qq : minimum d'output. On essaie apt-get puis apk en fallback shell.
      return `(command -v apt-get >/dev/null && DEBIAN_FRONTEND=noninteractive apt-get update -qq && apt-get install -y --no-install-recommends "${pkg}") || (command -v apk >/dev/null && apk add --no-cache "${pkg}")`;
    case 'apk':
      return `apk add --no-cache "${pkg}"`;
    case 'brew':
      return `brew install "${pkg}"`;
    case 'npm':
      return `npm install -g "${pkg}"`;
    case 'pip':
      return `pip install --user "${pkg}"`;
    case 'cargo':
      return `cargo install "${pkg}"`;
    default:
      return `npm install -g "${pkg}"`;
  }
}

/**
 * Vérifie qu'un nom de paquet est plausible (évite les injections shell évidentes).
 * Une fois validé, le nom est inséré entre guillemets dans la commande.
 */
function isSafePackageName(pkg: string): boolean {
  if (!pkg || pkg.length > 200) return false;
  // Caractères autorisés : lettres, chiffres, points, tirets, soulignés, slashes, @, :, =, +, |, espace simple.
  return /^[A-Za-z0-9._\-@/:=+|]+(?:\s+[A-Za-z0-9._\-@/:=+|]+)*$/.test(pkg);
}

export async function installToolPackage(params: {
  pkg: string;
  manager?: InstallManager;
}): Promise<InstallResult> {
  const pkg = String(params.pkg || '').trim();
  if (!pkg || !isSafePackageName(pkg)) {
    return {
      ok: false,
      manager: 'auto',
      command: '',
      error: 'Nom de paquet invalide ou non sûr.',
    };
  }
  const manager = chooseManager(pkg, params.manager ?? 'auto');
  const command = buildInstallCommand(pkg, manager);
  try {
    const infra = await getZimaOSInfraClient();
    const output = infra.exec(command);
    return { ok: true, manager, command, output };
  } catch (e) {
    return {
      ok: false,
      manager,
      command,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
