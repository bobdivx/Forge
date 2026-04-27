/**
 * Import dynamique obligatoire : un `import { … } from 'astro:db'` en tête de ce fichier
 * s’exécute pendant le bootstrap de `@astrojs/db` avant l’enregistrement du seed handler,
 * ce qui provoque « INTERNAL Seed handler not loaded yet ».
 *
 * Aucun projet, agent ni message fictif : les apps viennent de la synchro (/api/sync-projects),
 * les agents et modèles des actions utilisateur ou imports explicites.
 */
export default async function seed() {
  const { db, Config, AgentModel, AgentInstruction } = await import('astro:db');
  const { FORGE_DEFAULT_AGENT_MODELS } = await import('../src/lib/agent-model-defaults');
  const {
    FORGE_AGENT_INSTRUCTION_ROWS,
    readInstructionMdFromRepo,
  } = await import('../src/lib/agent-instruction-defaults');

  // ── 1. Config initiale (clés vides — pas de chemins imposés) ──
  try {
    const existingConfig = await db.select().from(Config);
    if (existingConfig.length === 0) {
      await db.insert(Config).values([
        { key: 'zimaosGatewayUrl', value: '', updatedAt: new Date() },
        { key: 'zimaosToken', value: '', updatedAt: new Date() },
        { key: 'ollamaUrl', value: '', updatedAt: new Date() },
        { key: 'githubToken', value: '', updatedAt: new Date() },
        { key: 'vercelToken', value: '', updatedAt: new Date() },
        { key: 'githubWebhookSecret', value: '', updatedAt: new Date() },
        { key: 'forgeReposRoot', value: '', updatedAt: new Date() },
        { key: 'dockerYamlDir', value: '', updatedAt: new Date() },
        { key: 'dockerAppDataDir', value: '', updatedAt: new Date() },
        { key: 'forgeReposRootAgent', value: '', updatedAt: new Date() },
        { key: 'forgeSetupState', value: 'pending', updatedAt: new Date() },
      ]);
      console.log('Config keys seeded (empty — utilisateur à renseigner).');
    }
  } catch (e) {
    console.warn('Config seed skipped:', e);
  }

  // ── 2. Catalogue modèles agents (fallback stable UI) ──
  try {
    if (!AgentModel) {
      console.warn('AgentModel seed skipped: table non resolue (schema Astro DB non regenere).');
      return;
    }
    const existingModels = await db.select().from(AgentModel);
    if (existingModels.length === 0) {
      const now = new Date();
      await db.insert(AgentModel).values(
        FORGE_DEFAULT_AGENT_MODELS.map((m) => ({
          id: m.id,
          label: m.label,
          source: 'seed',
          enabled: 1,
          updatedAt: now,
        })),
      );
      console.log('AgentModel seeded.');
    }
  } catch {
    console.warn('AgentModel seed skipped: schema/table indisponible pour cette execution.');
  }

  // ── 3. Migration instructions Markdown -> DB (source de vérité) ──
  try {
    if (!AgentInstruction) {
      console.warn('AgentInstruction seed skipped: table non resolue (schema Astro DB non regenere).');
      return;
    }
    const existingInstructions = await db.select().from(AgentInstruction);
    if (existingInstructions.length === 0) {
      const now = new Date();
      await db.insert(AgentInstruction).values(
        FORGE_AGENT_INSTRUCTION_ROWS.map((row) => ({
          agentId: row.agentId,
          model: row.model,
          filePath: row.filePath,
          systemPrompt: readInstructionMdFromRepo(row.filePath),
          enabled: 1,
          updatedAt: now,
        })),
      );
      console.log('AgentInstruction seeded from legacy markdown files.');
    }
  } catch (e) {
    console.warn('AgentInstruction seed skipped:', e);
  }
}
