// @ts-nocheck
import type { APIRoute } from 'astro';
import { loadAstroDb } from '../../lib/load-astro-db';

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** GET ?agentId=CHEF_TECHNIQUE — agrège l'état de l'agent et ses missions depuis Astro DB. */
export const GET: APIRoute = async ({ locals, url }) => {
  if (!locals.user?.email) {
    return json({ error: 'Non authentifié' }, 401);
  }
  const agentId = String(url.searchParams.get('agentId') || '').trim();
  if (!agentId) {
    return json({ error: 'agentId requis' }, 400);
  }

  try {
    const { db, AgentTask, AgentInstruction, eq, desc } = await loadAstroDb();
    
    // 1. Infos de base de l'agent
    const instruction = await db
      .select()
      .from(AgentInstruction)
      .where(eq(AgentInstruction.agentId, agentId))
      .then(rows => rows[0]);

    // 2. Tâches / Missions
    const dbTasks = await db
      .select()
      .from(AgentTask)
      .where(eq(AgentTask.agentId, agentId))
      .orderBy(desc(AgentTask.createdAt));

    const missionTasks = dbTasks.map((t: any) => ({
      id: t.id,
      agentId: t.agentId,
      task: t.task,
      input: t.input ?? null,
      output: t.output ?? null,
      status: t.status,
      createdAt: t.createdAt instanceof Date ? t.createdAt.toISOString() : String(t.createdAt),
      updatedAt: t.updatedAt instanceof Date ? t.updatedAt.toISOString() : String(t.updatedAt),
    }));

    const st = (s: string) => String(s ?? '').toLowerCase();
    const running = missionTasks.filter((t) => ['running', 'in_progress'].includes(st(t.status)));
    const pending = missionTasks.filter((t) => st(t.status) === 'pending');
    const recentDone = missionTasks.filter((t) =>
      ['completed', 'success', 'failed', 'bug', 'cancelled', 'resolved'].includes(st(t.status)),
    );

    return json({
      ok: true,
      agentId,
      agent: instruction ? {
        enabled: !!instruction.enabled,
        model: instruction.model,
        updatedAt: instruction.updatedAt.toISOString(),
      } : null,
      buckets: { 
        running, 
        pending, 
        recentDone: recentDone.slice(0, 12) 
      },
      // Mock ZimaOS object for frontend compatibility (deprecated)
      zimaos: {
        matched: !!instruction,
        status: instruction?.enabled ? 'actif' : 'en pause',
        model: instruction?.model || '—',
        messages: []
      }
    });
  } catch (error: any) {
    console.error('swarm-agent-panel error:', error);
    return json({ error: 'Erreur base de données' }, 500);
  }
};
