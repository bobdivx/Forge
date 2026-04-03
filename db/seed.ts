import { db, Project, AppData, Heartbeat, AgentMessage, AgentInstruction, Config } from 'astro:db';
import {
  FORGE_AGENT_INSTRUCTION_ROWS,
  readInstructionMdFromRepo,
} from '../src/lib/agent-instruction-defaults';

export default async function seed() {
  // ── 1. Données de base (Project, AppData, Heartbeat, AgentMessage) ──────────
  try {
    const existingProjects = await db.select().from(Project);
    if (existingProjects.length === 0) {
      console.log('Seeding base data...');

      await db.insert(Project).values([
        { name: 'Forge',    path: '/media/Github/Forge',    status: 'active', description: 'Dashboard DevForge' },
        { name: 'Tesla',    path: '/media/Github/tesla',    status: 'active' },
        { name: 'ZimaOS-MCP', path: '/media/Github/ZimaOS-MCP', status: 'active' },
        { name: 'Popcorn',  path: '/media/Github/popcorn',  status: 'dev' },
      ]);

      await db.insert(AppData).values([
        { appName: 'OpenClaw', composePath: '/DATA/AppData/openclaw', dataDir: '/DATA/AppData/openclaw', status: 'running' },
      ]);

      await db.insert(Heartbeat).values([
        { level: 'info', message: 'Forge initialized with Astro DB', source: 'CHEF_TECHNIQUE' },
      ]);

      await db.insert(AgentMessage).values([
        { fromAgent: 'CHEF_TECHNIQUE', content: 'Base de données de communication activée.' },
      ]);

      console.log('Base data seeded.');
    } else {
      console.log('Base data already present, skipping.');
    }
  } catch (e) {
    console.error('Base seed failed:', e);
  }

  // ── 2. Config par défaut ─────────────────────────────────────────────────────
  try {
    const existingConfig = await db.select().from(Config);
    if (existingConfig.length === 0) {
      await db.insert(Config).values([
        { key: 'openclawGatewayUrl', value: 'http://127.0.0.1:24190', updatedAt: new Date() },
        { key: 'openclawToken',      value: '',                        updatedAt: new Date() },
        { key: 'githubToken',        value: '',                        updatedAt: new Date() },
        { key: 'vercelToken',        value: '',                        updatedAt: new Date() },
        { key: 'forgeReposRoot',     value: '/media/Github',           updatedAt: new Date() },
        { key: 'dockerYamlDir',      value: '/DATA/AppData',           updatedAt: new Date() },
        { key: 'dockerAppDataDir',   value: '/DATA/AppData',           updatedAt: new Date() },
      ]);
      console.log('Config defaults seeded.');
    }
  } catch (e) {
    console.warn('Config seed skipped:', e);
  }

  // ── 3. Instructions agents — bloc isolé, ne bloque pas le reste ───────────
  try {
    const existing = await db.select().from(AgentInstruction);
    if (existing.length === 0) {
      const rows = FORGE_AGENT_INSTRUCTION_ROWS.map((agent) => ({
        agentId:      agent.agentId,
        model:        agent.model,
        filePath:     agent.filePath,
        systemPrompt: readInstructionMdFromRepo(agent.filePath),
        enabled:      1,
        updatedAt:    new Date(),
      }));
      await db.insert(AgentInstruction).values(rows);
      console.log(`Seeded ${rows.length} agent instructions.`);
    }
  } catch (e) {
    console.warn('AgentInstruction seed skipped (migration peut-être en cours):', e);
  }
}
