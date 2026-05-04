import { eq } from 'drizzle-orm';
import { loadAstroDb } from './load-astro-db';
import { getAllConfig } from './config-db';
import { SWARM_WORK_PROTOCOL_SUMMARY } from './forge-agent-protocol';

/**
 * Crée ou met à jour l’instruction agent dans la base Forge.
 */
export async function applyAgentInstructionModel(agentIdRaw: string, modelRaw: string): Promise<void> {
  const agentId = String(agentIdRaw || '').trim();
  let model = String(modelRaw || '').trim();
  if (!agentId || agentId.length < 2) {
    throw new Error('Identifiant agent invalide');
  }
  if (!model) {
    throw new Error('Modèle requis');
  }
  if (model === 'Auto') {
    try {
      const config = await getAllConfig();
      model = String(config.agentDefaultModel || '').trim() || model;
    } catch {
      /* garde Auto si besoin */
    }
  }

  const { db, AgentInstruction } = await loadAstroDb();
  const existing = await db.select().from(AgentInstruction).where(eq(AgentInstruction.agentId, agentId)).limit(1);
  const now = new Date();

  if (existing.length) {
    await db.update(AgentInstruction).set({ model, updatedAt: now }).where(eq(AgentInstruction.agentId, agentId));
  } else {
    const prompt = `# ${agentId}\n\nVous êtes l'agent ${agentId}. Répondez de manière concise, structurée et orientée action.\n\n${SWARM_WORK_PROTOCOL_SUMMARY}`;
    await db.insert(AgentInstruction).values({
      agentId,
      model,
      filePath: `db://${agentId}`,
      systemPrompt: prompt,
      enabled: 1,
      updatedAt: now,
    });
  }

  const row = await db.select().from(AgentInstruction).where(eq(AgentInstruction.agentId, agentId)).limit(1);
  if (!row.length) throw new Error('Lecture instruction après écriture impossible');
}
