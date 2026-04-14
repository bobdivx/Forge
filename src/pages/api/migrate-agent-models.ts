import { db, AgentInstruction, eq } from 'astro:db';

export const GET = async () => {
  try {
    const mappings = [
      { id: 'CHEF_TECHNIQUE',      model: 'qwen3-coder:30b' },
      { id: 'ARCHITECTE_LOGICIEL', model: 'qwen3-coder:30b' },
      { id: 'DEV_BACKEND',         model: 'qwen2.5:7b' },
      { id: 'DEV_FRONTEND',        model: 'qwen2.5:7b' },
      { id: 'EXPERT_GITHUB',       model: 'gemma4:latest' },
      { id: 'ANALYSTE_CODE',       model: 'llama3.2:latest' },
      { id: 'TESTEUR_QA',          model: 'qwen2.5:7b' },
      { id: 'INFRA_TECH',          model: 'qwen2.5:7b' },
      { id: 'SECURITE_CODE',       model: 'llama3.2:latest' },
      { id: 'INGENIEUR_HARDWARE',  model: 'gemma4:latest' },
      { id: 'INGENIEUR_PROMPT',    model: 'llama3.2:latest' },
      { id: 'MAINTENANCE_REPO',    model: 'gemma4:latest' },
      { id: 'REDACTEUR_DOC',       model: 'gemma4:latest' },
      { id: 'SCRIPTEUR_AUTOMATE',  model: 'qwen2.5:7b' },
      { id: 'VEILLE_TECH',         model: 'llama3.2:latest' },
    ];

    let count = 0;
    for (const row of mappings) {
      await db.update(AgentInstruction)
        .set({ model: row.model, updatedAt: new Date() })
        .where(eq(AgentInstruction.agentId, row.id));
      count++;
    }

    return new Response(JSON.stringify({ 
      ok: true, 
      message: `FORCED migration of ${count} agents to real catalog IDs.`,
      appliedMappings: mappings
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: e.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
