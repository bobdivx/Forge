// @ts-nocheck
export const prerender = false;

/**
 * GET  /api/agent-budget?agentId=XXX  → retourne le budget d'un agent
 * GET  /api/agent-budget               → retourne tous les budgets avec résumé coûts
 * PATCH /api/agent-budget              → modifie le budget d'un agent
 *
 * Inspiré de Paperclip PATCH /agents/:agentId/budgets
 */

export async function GET({ url }: { url: URL }) {
  try {
    const { loadAstroDb } = await import("../../lib/load-astro-db");
    const { db, AgentBudget, CostEvent, AgentInstruction, eq } =
      await loadAstroDb();

    const agentId = url.searchParams.get("agentId");

    // Récupérer tous les budgets (avec infos agents) en parallèle
    const [budgets, allEvents, instructions] = await Promise.all([
      db.select().from(AgentBudget),
      db.select().from(CostEvent),
      db.select().from(AgentInstruction),
    ]);

    // Map agentId → model name
    const agentModels: Record<string, string> = {};
    for (const inst of instructions) {
      agentModels[inst.agentId] = inst.model;
    }

    // Calculer totaux par agent (tous les temps)
    const totalByAgent: Record<
      string,
      {
        cents: number;
        inputTokens: number;
        outputTokens: number;
        calls: number;
      }
    > = {};
    for (const ev of allEvents) {
      if (!totalByAgent[ev.agentId]) {
        totalByAgent[ev.agentId] = {
          cents: 0,
          inputTokens: 0,
          outputTokens: 0,
          calls: 0,
        };
      }
      totalByAgent[ev.agentId].cents += ev.costCents ?? 0;
      totalByAgent[ev.agentId].inputTokens += ev.inputTokens ?? 0;
      totalByAgent[ev.agentId].outputTokens += ev.outputTokens ?? 0;
      totalByAgent[ev.agentId].calls += 1;
    }

    // Calculer totaux du mois courant par agent
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthlyByAgent: Record<
      string,
      { cents: number; inputTokens: number; outputTokens: number }
    > = {};
    for (const ev of allEvents) {
      const evDate = new Date(ev.occurredAt);
      if (evDate >= monthStart) {
        if (!monthlyByAgent[ev.agentId]) {
          monthlyByAgent[ev.agentId] = {
            cents: 0,
            inputTokens: 0,
            outputTokens: 0,
          };
        }
        monthlyByAgent[ev.agentId].cents += ev.costCents ?? 0;
        monthlyByAgent[ev.agentId].inputTokens += ev.inputTokens ?? 0;
        monthlyByAgent[ev.agentId].outputTokens += ev.outputTokens ?? 0;
      }
    }

    // Enrichir agentIds connus depuis les instructions (même sans budget configuré)
    const allAgentIds = new Set([
      ...budgets.map((b) => b.agentId),
      ...Object.keys(totalByAgent),
    ]);

    if (agentId) {
      // Mode single agent
      const budget = budgets.find((b) => b.agentId === agentId) ?? {
        agentId,
        monthlyCents: 0,
        spentThisMonth: 0,
        alertThreshold: 80,
        hardStop: 0,
        resetAt: null,
      };
      const monthly = monthlyByAgent[agentId] ?? {
        cents: 0,
        inputTokens: 0,
        outputTokens: 0,
      };
      const total = totalByAgent[agentId] ?? {
        cents: 0,
        inputTokens: 0,
        outputTokens: 0,
        calls: 0,
      };
      const pct =
        budget.monthlyCents > 0
          ? Math.round((monthly.cents / budget.monthlyCents) * 100)
          : null;

      return new Response(
        JSON.stringify({
          ...budget,
          monthly,
          total,
          pct,
          model: agentModels[agentId],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    // Mode liste complète
    const result = [...allAgentIds].map((aid) => {
      const budget = budgets.find((b) => b.agentId === aid) ?? {
        agentId: aid,
        monthlyCents: 0,
        spentThisMonth: 0,
        alertThreshold: 80,
        hardStop: 0,
        resetAt: null,
      };
      const monthly = monthlyByAgent[aid] ?? {
        cents: 0,
        inputTokens: 0,
        outputTokens: 0,
      };
      const total = totalByAgent[aid] ?? {
        cents: 0,
        inputTokens: 0,
        outputTokens: 0,
        calls: 0,
      };
      const pct =
        budget.monthlyCents > 0
          ? Math.round((monthly.cents / budget.monthlyCents) * 100)
          : null;
      return { ...budget, monthly, total, pct, model: agentModels[aid] };
    });

    // Totaux globaux du mois
    const globalMonthly = Object.values(monthlyByAgent).reduce(
      (acc, v) => ({
        cents: acc.cents + v.cents,
        inputTokens: acc.inputTokens + v.inputTokens,
        outputTokens: acc.outputTokens + v.outputTokens,
      }),
      { cents: 0, inputTokens: 0, outputTokens: 0 },
    );

    return new Response(JSON.stringify({ agents: result, globalMonthly }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({ error: "Internal server error", detail: message }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}

export async function PATCH({ request }: { request: Request }) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { agentId, monthlyCents, alertThreshold, hardStop, resetSpent } =
    body as {
      agentId?: string;
      monthlyCents?: number;
      alertThreshold?: number;
      hardStop?: 0 | 1;
      resetSpent?: boolean;
    };

  if (!agentId) {
    return new Response(JSON.stringify({ error: "agentId is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const { loadAstroDb } = await import("../../lib/load-astro-db");
    const { db, AgentBudget, ActivityLog, eq } = await loadAstroDb();
    const now = new Date();

    const existing = await db
      .select()
      .from(AgentBudget)
      .where(eq(AgentBudget.agentId, agentId));

    const updates: Record<string, unknown> = { updatedAt: now };
    if (monthlyCents !== undefined) updates.monthlyCents = monthlyCents;
    if (alertThreshold !== undefined) updates.alertThreshold = alertThreshold;
    if (hardStop !== undefined) updates.hardStop = hardStop;
    if (resetSpent) updates.spentThisMonth = 0;

    if (existing.length === 0) {
      await db.insert(AgentBudget).values({
        agentId,
        monthlyCents: monthlyCents ?? 0,
        spentThisMonth: 0,
        alertThreshold: alertThreshold ?? 80,
        hardStop: hardStop ?? 0,
        resetAt: null,
        updatedAt: now,
      });
    } else {
      await db
        .update(AgentBudget)
        .set(updates)
        .where(eq(AgentBudget.agentId, agentId));
    }

    // Audit log
    await db.insert(ActivityLog).values({
      actorType: "user",
      actorId: "board",
      action: "budget.updated",
      entityType: "agent",
      entityId: agentId,
      details: JSON.stringify(updates),
      createdAt: now,
    });

    return new Response(JSON.stringify({ success: true, agentId }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({ error: "Internal server error", detail: message }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}
