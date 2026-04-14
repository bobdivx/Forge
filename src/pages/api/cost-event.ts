// @ts-nocheck
export const prerender = false;

/**
 * POST /api/cost-event
 * Ingère un événement de coût généré par un agent OpenClaw.
 * Inspiré de Paperclip /cost-events endpoint.
 *
 * Body JSON:
 * {
 *   agentId: string,
 *   taskId?: number,
 *   provider?: string,       // "ollama" | "openai" | "anthropic" | "gemini"
 *   model: string,
 *   inputTokens?: number,
 *   outputTokens?: number,
 *   costCents?: number,
 *   occurredAt?: string      // ISO 8601, défaut = now
 * }
 *
 * Effets:
 * - Insert CostEvent
 * - Upsert AgentBudget.spentThisMonth
 * - Si hardStop && spentThisMonth >= monthlyCents → logge ActivityLog (budget.exceeded)
 * - Si alerte douce franchie → logge ActivityLog (budget.alert)
 */
export async function POST({ request }: { request: Request }) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const {
    agentId,
    taskId,
    provider = 'ollama',
    model,
    inputTokens = 0,
    outputTokens = 0,
    costCents = 0,
    occurredAt,
  } = body as {
    agentId?: string;
    taskId?: number;
    provider?: string;
    model?: string;
    inputTokens?: number;
    outputTokens?: number;
    costCents?: number;
    occurredAt?: string;
  };

  if (!agentId || !model) {
    return new Response(
      JSON.stringify({ error: 'agentId and model are required' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  if (inputTokens < 0 || outputTokens < 0 || costCents < 0) {
    return new Response(
      JSON.stringify({ error: 'Token counts and cost must be >= 0' }),
      { status: 422, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    const { loadAstroDb } = await import('../../lib/load-astro-db');
    const { db, CostEvent, AgentBudget, ActivityLog, eq } = await loadAstroDb();

    const now = new Date();
    const eventDate = occurredAt ? new Date(occurredAt) : now;

    // 1. Insérer l'événement de coût
    await db.insert(CostEvent).values({
      agentId,
      taskId: taskId ?? null,
      provider,
      model,
      inputTokens,
      outputTokens,
      costCents,
      occurredAt: eventDate,
    });

    // 2. Lire ou créer le budget Pour cet agent
    const budgetRows = await db
      .select()
      .from(AgentBudget)
      .where(eq(AgentBudget.agentId, agentId));

    let budget = budgetRows[0] ?? null;

    if (!budget) {
      // Créer un budget par défaut (illimité)
      await db.insert(AgentBudget).values({
        agentId,
        monthlyCents: 0,
        spentThisMonth: costCents,
        alertThreshold: 80,
        hardStop: 0,
        resetAt: null,
        updatedAt: now,
      });
    } else {
      // Vérifier si réinitialisation mensuelle nécessaire
      const shouldReset =
        budget.resetAt && new Date(budget.resetAt).getMonth() !== now.getMonth();

      const newSpent = shouldReset ? costCents : (budget.spentThisMonth ?? 0) + costCents;

      await db
        .update(AgentBudget)
        .set({
          spentThisMonth: newSpent,
          resetAt: shouldReset ? now : budget.resetAt,
          updatedAt: now,
        })
        .where(eq(AgentBudget.agentId, agentId));

      // 3. Vérifier seuils budget (seulement si budget > 0)
      if (budget.monthlyCents > 0) {
        const pct = (newSpent / budget.monthlyCents) * 100;
        const prevPct =
          ((budget.spentThisMonth ?? 0) / budget.monthlyCents) * 100;

        // Alerte douce
        const alertPct = budget.alertThreshold ?? 80;
        if (prevPct < alertPct && pct >= alertPct) {
          await db.insert(ActivityLog).values({
            actorType: 'system',
            actorId: 'forge-budget-engine',
            action: 'budget.alert',
            entityType: 'agent',
            entityId: agentId,
            details: JSON.stringify({ pct: Math.round(pct), monthlyCents: budget.monthlyCents, spent: newSpent }),
            createdAt: now,
          });
        }

        // Hard stop
        if (budget.hardStop && newSpent >= budget.monthlyCents) {
          await db.insert(ActivityLog).values({
            actorType: 'system',
            actorId: 'forge-budget-engine',
            action: 'budget.exceeded',
            entityType: 'agent',
            entityId: agentId,
            details: JSON.stringify({ pct: 100, monthlyCents: budget.monthlyCents, spent: newSpent }),
            createdAt: now,
          });
        }
      }
    }

    // 4. Log de l'ingestion dans ActivityLog
    await db.insert(ActivityLog).values({
      actorType: 'agent',
      actorId: agentId,
      action: 'cost.ingested',
      entityType: 'cost_event',
      entityId: String(agentId),
      details: JSON.stringify({ model, provider, inputTokens, outputTokens, costCents }),
      createdAt: now,
    });

    return new Response(
      JSON.stringify({ success: true, agentId, costCents }),
      { status: 201, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[cost-event] Error:', message);
    return new Response(
      JSON.stringify({ error: 'Internal server error', detail: message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
