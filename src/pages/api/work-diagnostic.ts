// @ts-nocheck
import type { APIRoute } from 'astro';
import { eq, desc, or } from 'drizzle-orm';
import { loadAstroDb } from '../../lib/load-astro-db';
import { getWorkSystemStatus } from '../../lib/forge-work-scheduler';

export const GET: APIRoute = async () => {
  try {
    const { db, Project, AgentInstruction, ActivityLog, AgentBudget, CostEvent, sql } = await loadAstroDb();
    const projects = await db.select().from(Project);
    const agents = await db.select().from(AgentInstruction);

    const budgets = await db.select().from(AgentBudget);
    const activeBudgets = budgets.filter((b) => b.enabled === 1);
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const costs = await db
      .select({
        total: sql`sum(${CostEvent.costCents})`,
      })
      .from(CostEvent)
      .where(sql`${CostEvent.occurredAt} >= ${startOfMonth}`);
    const currentMonthlyCents = Number(costs[0]?.total || 0);
    const globalHardStopCents =
      activeBudgets.reduce((acc, b) => acc + Number(b.monthlyCents || 0), 0) || 5000;

    const logs = await db
      .select()
      .from(ActivityLog)
      .where(
        or(
          eq(ActivityLog.action, 'swarm.task.dispatch_failed'),
          eq(ActivityLog.action, 'swarm.issue.dispatch_failed'),
        ),
      )
      .orderBy(desc(ActivityLog.createdAt))
      .limit(20);

    const work = await getWorkSystemStatus();

    return new Response(
      JSON.stringify({
        ok: true,
        workSystem: work,
        budget: {
          currentMonthlyEuros: currentMonthlyCents / 100,
          capEuros: globalHardStopCents / 100,
          exceeded: currentMonthlyCents >= globalHardStopCents,
        },
        projects: projects.map((p) => ({
          id: p.id,
          name: p.name,
          swarmEnabled: Number(p.swarmEnabled) === 1,
        })),
        agents: agents.map((a) => ({
          agentId: a.agentId,
          enabled: Number(a.enabled) === 1,
          model: a.model,
        })),
        recentDispatchFailures: logs.map((l) => ({
          at: l.createdAt instanceof Date ? l.createdAt.toISOString() : String(l.createdAt),
          details: l.details,
        })),
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
