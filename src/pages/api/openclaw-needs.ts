import type { APIRoute } from 'astro';
import {
  fetchOpenClawJson,
  normalizeOpenClawSessions,
  mapSessionToAgentRow,
} from '../../lib/openclaw-gateway';

/**
 * "Besoins" = vue réelle des agents + modèles observés sur les sessions OpenClaw
 * (pas de liste fictive d'outils).
 */
export const GET: APIRoute = async ({ locals }) => {
  const email = locals.user?.email;
  const result = await fetchOpenClawJson(email, '/health');

  if (!result.ok) {
    return new Response(
      JSON.stringify({ error: result.error, items: [] }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const sessions = normalizeOpenClawSessions(result.data);
  const rows = sessions.map(mapSessionToAgentRow);
  const byName = new Map<string, (typeof rows)[0]>();
  for (const r of rows) {
    if (!byName.has(r.name)) byName.set(r.name, r);
  }

  const items = [...byName.values()].map((r) => ({
    agent: r.name,
    tool: `LLM · ${r.model}`,
    reason: 'Configuration observée sur la dernière session connue pour cet agent.',
    status: r.status === 'actif' ? 'Session active' : 'En veille',
    priority: r.status === 'actif' ? 'Haute' : 'Normale',
    actionRequired:
      'Aucune action Forge : géré dans OpenClaw (modèles / gateway).',
  }));

  return new Response(JSON.stringify({ items }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
