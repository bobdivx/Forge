import { performOpenClawAgentsSync } from './openclaw-sync-agents';

export type OpenClawPreRepairResult = {
  attempted: boolean;
  ok: boolean;
  note?: string;
  error?: string;
  skipped?: boolean;
};

let lastAttemptMs = 0;
const MIN_REPAIR_INTERVAL_MS = 45_000;

export async function attemptOpenClawPreRepair(
  reason: string,
  options?: { force?: boolean },
): Promise<OpenClawPreRepairResult> {
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
    const repaired = await performOpenClawAgentsSync();
    return {
      attempted: true,
      ok: true,
      note: `reason=${reason} mode=${repaired.mode}${repaired.via ? ` via=${repaired.via}` : ''}`,
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
