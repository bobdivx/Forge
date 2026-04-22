import type { APIRoute } from 'astro';
import { getAllConfig, setConfig } from '../../lib/config-db';

const MIN_INTERVAL = 5;
const MAX_INTERVAL = 24 * 60;

function normalizeAgentId(input: unknown, fallback: string): string {
  const raw = String(input ?? '').trim().toUpperCase();
  const cleaned = raw.replace(/[^A-Z0-9_]/g, '');
  return cleaned || fallback;
}

function normalizeEnabled(input: unknown): string {
  const v = String(input ?? '').trim().toLowerCase();
  return v === 'true' || v === '1' || v === 'yes' ? 'true' : 'false';
}

function normalizeInterval(input: unknown): string {
  const n = Number.parseInt(String(input ?? ''), 10);
  if (!Number.isFinite(n)) return '60';
  return String(Math.min(MAX_INTERVAL, Math.max(MIN_INTERVAL, n)));
}

export const GET: APIRoute = async () => {
  const config = await getAllConfig();
  return new Response(
    JSON.stringify({
      routineEnabled: config.routineEnabled || 'false',
      routineIntervalMinutes: config.routineIntervalMinutes || '60',
      routineGithubRoot: config.routineGithubRoot || config.forgeReposRoot || '',
      routineWatchAgentId: config.routineWatchAgentId || 'MAINTENANCE_REPO',
      routineImproveAgentId: config.routineImproveAgentId || 'VEILLE_TECH',
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
};

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json().catch(() => ({}));
    const next = {
      routineEnabled: normalizeEnabled(body?.routineEnabled),
      routineIntervalMinutes: normalizeInterval(body?.routineIntervalMinutes),
      routineGithubRoot: String(body?.routineGithubRoot ?? '').trim(),
      routineWatchAgentId: normalizeAgentId(body?.routineWatchAgentId, 'MAINTENANCE_REPO'),
      routineImproveAgentId: normalizeAgentId(body?.routineImproveAgentId, 'VEILLE_TECH'),
    };
    await setConfig(next);
    return new Response(JSON.stringify({ ok: true, config: next }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'Échec de sauvegarde de la routine.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
