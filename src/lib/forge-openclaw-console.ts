/**
 * Logs côté navigateur (Chrome DevTools) pour diagnostiquer OpenClaw.
 * Aucun secret n’est passé ici : uniquement URL, sources, compteurs, statuts HTTP.
 */
const PREFIX = '[DevForge OpenClaw]';

export function logForgeOpenClaw(context: string, payload: Record<string, unknown>): void {
  if (typeof globalThis === 'undefined' || !globalThis.console?.info) return;
  try {
    globalThis.console.info(`${PREFIX} ${context}`, payload);
  } catch {
    /* ignore */
  }
}
