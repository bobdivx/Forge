import { performZimaOSAgentsSync } from './zimaos-sync-agents';
import { getConfig } from '../../lib/config-db';
import { getZimaOSInfraClient } from '../../lib/zimaos-infra-client';

export type ZimaOSPreRepairResult = {
  attempted: boolean;
  ok: boolean;
  note?: string;
  error?: string;
  skipped?: boolean;
};

let lastAttemptMs = 0;
const MIN_REPAIR_INTERVAL_MS = 45_000;

async function ensureGatewayToolsAllowlist(): Promise<{
  changed: boolean;
  path?: string;
  restarted?: boolean;
  error?: string;
}> {
  const infra = await getZimaOSInfraClient();
  const appDataDir = (await getConfig('dockerAppDataDir')).trim() || 'C:\\DATA\\AppData';
  const candidates = [
    `${appDataDir.replace(/[\\/]+$/, '')}/zimaos/zimaos.json`,
    'X:/AppData/zimaos/zimaos.json',
    'X:/AppData/zimaos/config/zimaos.json',
    'C:/DATA/AppData/zimaos/zimaos.json',
    '/DATA/AppData/zimaos/zimaos.json',
  ];

  let configPath = '';
  for (const p of candidates) {
    if (infra.exists(p)) {
      configPath = p;
      break;
    }
  }
  if (!configPath) return { changed: false, error: 'zimaos.json introuvable' };

  try {
    const raw = infra.readFile(configPath);
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const gateway = (parsed.gateway ?? {}) as Record<string, unknown>;
    const tools = (gateway.tools ?? {}) as Record<string, unknown>;
    const current = Array.isArray(tools.allow)
      ? tools.allow.map((v) => String(v || '').trim()).filter(Boolean)
      : [];
    const need = ['sessions_list', 'sessions_send', 'agents_invoke'];
    const merged = [...new Set([...current, ...need])];
    const changed = merged.length !== current.length || need.some((k) => !current.includes(k));
    if (!changed) return { changed: false, path: configPath };

    const next = {
      ...parsed,
      gateway: {
        ...gateway,
        tools: {
          ...tools,
          allow: merged,
        },
      },
    };
    infra.writeFile(configPath, JSON.stringify(next, null, 2));
    let restarted = false;
    try {
      infra.restartContainer();
      restarted = true;
    } catch {
      restarted = false;
    }
    return { changed: true, path: configPath, restarted };
  } catch (e: unknown) {
    return { changed: false, path: configPath, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function attemptZimaOSPreRepair(
  reason: string,
  options?: { force?: boolean },
): Promise<ZimaOSPreRepairResult> {
  const now = Date.now();
  const force = Boolean(options?.force);
  if (!force && now - lastAttemptMs < MIN_REPAIR_INTERVAL_MS) {
    return {
      attempted: false,
      ok: true,
      skipped: true,
      note: `skip(cooldown ${MIN_REPAIR_INTERVAL_MS}ms) reason=${reason}`,
    };
  }
  lastAttemptMs = now;

  try {
    const repaired = await performZimaOSAgentsSync();
    const toolsFix = await ensureGatewayToolsAllowlist();
    return {
      attempted: true,
      ok: true,
      note: `reason=${reason} mode=${repaired.mode}${repaired.via ? ` via=${repaired.via}` : ''}${toolsFix.changed ? ` toolsAllow=updated` : ''}`,
    };
  } catch (error: unknown) {
    return {
      attempted: true,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      note: `reason=${reason}`,
    };
  }
}
