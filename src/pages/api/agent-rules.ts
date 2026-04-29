import type { APIRoute } from 'astro';
import { loadAstroDb } from '../../lib/load-astro-db';
import { getAgentRules, saveAgentRules, type AgentRule } from '../../lib/agent-rules';

export const GET: APIRoute = async () => {
  try {
    const rules = await getAgentRules();
    const { db, Project } = await loadAstroDb();
    const projects = await db
      .select({ id: Project.id, name: Project.name, path: Project.path, status: Project.status })
      .from(Project)
      .orderBy(Project.name);
    return new Response(JSON.stringify({ ok: true, rules, projects }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e), rules: [], projects: [] }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }
};

export const POST: APIRoute = async ({ request }) => {
  const body = (await request.json().catch(() => ({}))) as { rules?: AgentRule[] };
  const rules = Array.isArray(body.rules) ? body.rules : [];
  await saveAgentRules(rules);
  return new Response(JSON.stringify({ ok: true, count: rules.length }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

