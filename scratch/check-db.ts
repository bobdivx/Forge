import { loadAstroDb } from './src/lib/load-astro-db';

async function check() {
    const { db, AgentBudget, AgentInstruction } = await loadAstroDb();
    const budgets = await db.select().from(AgentBudget);
    const agents = await db.select().from(AgentInstruction);
    console.log('--- AgentBudgets ---');
    console.log(JSON.stringify(budgets, null, 2));
    console.log('--- AgentInstructions ---');
    console.log(JSON.stringify(agents.map(a => a.agentId), null, 2));
}

check().catch(console.error);
