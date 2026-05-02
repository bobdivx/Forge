/**
 * Agents « projet » Forge : identifiants `PARENT__APP_<jeton>` et lignes `AgentInstruction`.
 * La source de vérité est la base Forge ; le gateway ZimaOS n’intervient que pour le provisioning (push config).
 */
import { eq } from 'drizzle-orm';
import { loadAstroDb } from './load-astro-db';
import { provisionAgentInZimaOS } from './zimaos-agent-provision';
import { insertForgeActivityLog } from './forge-activity-log';

const SUBAGENT_PREFIX = 'APP';
const MAX_AGENT_ID_LENGTH = 72;
/** Marqueur `PARENT__APP_<projet>` — convention Forge pour les agents enfants par dépôt / projet. */
export const FORGE_PROJECT_CHILD_TOKEN = `__${SUBAGENT_PREFIX}_`;
const SUBAGENT_IDLE_TTL_DAYS = 14;
const TERMINAL_TASK_STATUSES = new Set(['completed', 'failed', 'cancelled']);

function sanitizeProjectToken(input: string): string {
  return String(input || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 28);
}

function buildProjectScopedAgentId(parentAgentId: string, projectName: string): string {
  const parent = String(parentAgentId || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, '_')
    .replace(/^_+|_+$/g, '');
  const token = sanitizeProjectToken(projectName) || 'PROJECT';
  const base = `${parent}__${SUBAGENT_PREFIX}_${token}`;
  return base.slice(0, MAX_AGENT_ID_LENGTH);
}

function buildProjectScopedPrompt(params: {
  parentAgentId: string;
  basePrompt: string;
  projectName: string;
  projectPath: string;
}): string {
  const context = [
    '',
    '---',
    '## Contexte de sous-agent applicatif (Forge)',
    `- Parent: ${params.parentAgentId}`,
    `- Scope projet: ${params.projectName}`,
    `- Chemin projet: ${params.projectPath}`,
    '- Règle: rester strictement dans le scope de ce projet pour l’analyse, les actions et les propositions.',
    '- Si une demande dépasse ce périmètre, remonter au parent avec un résumé court et actionnable.',
  ].join('\n');
  return `${params.basePrompt.trim()}\n${context}`.slice(0, 120_000);
}

export async function ensureForgeProjectScopedAgent(params: {
  parentAgentId: string;
  projectId?: number | null;
}): Promise<{ agentId: string; created: boolean }> {
  const parentAgentId = String(params.parentAgentId || '').trim().toUpperCase();
  if (!parentAgentId || !params.projectId) {
    return { agentId: parentAgentId, created: false };
  }

  const { db, AgentInstruction, Project } = await loadAstroDb();
  const projectRows = await db
    .select()
    .from(Project)
    .where(eq(Project.id, Number(params.projectId)))
    .limit(1);
  const project = projectRows[0];
  if (!project) return { agentId: parentAgentId, created: false };

  const agentId = buildProjectScopedAgentId(parentAgentId, project.name);
  const existing = await db
    .select()
    .from(AgentInstruction)
    .where(eq(AgentInstruction.agentId, agentId))
    .limit(1);
  if (existing.length) {
    return { agentId, created: false };
  }

  const parentRows = await db
    .select()
    .from(AgentInstruction)
    .where(eq(AgentInstruction.agentId, parentAgentId))
    .limit(1);
  const parent = parentRows[0];
  if (!parent) return { agentId: parentAgentId, created: false };

  const filePath = `doc/agents/apps/${agentId}.md`;
  const prompt = buildProjectScopedPrompt({
    parentAgentId,
    basePrompt: String(parent.systemPrompt || ''),
    projectName: String(project.name || 'Projet'),
    projectPath: String(project.path || ''),
  });

  await db.insert(AgentInstruction).values({
    agentId,
    model: String(parent.model || '').trim() || 'qwen2.5:7b',
    filePath,
    systemPrompt: prompt,
    enabled: 1,
    updatedAt: new Date(),
  });

  const provision = await provisionAgentInZimaOS({
    agentId,
    model: String(parent.model || '').trim() || 'qwen2.5:7b',
    filePath,
    systemPrompt: prompt,
  });

  await insertForgeActivityLog({
    actorType: 'system',
    actorId: 'work_scheduler',
    action: 'swarm.subagent.project_created',
    entityType: 'agent_instruction',
    entityId: agentId,
    details: {
      parentAgentId,
      projectId: project.id,
      projectName: project.name,
      provisionOk: provision.ok,
      provisionSteps: provision.steps,
    },
  });

  return { agentId, created: true };
}

export async function cleanupIdleForgeProjectScopedAgents(): Promise<{
  scanned: number;
  removed: string[];
}> {
  const { db, AgentInstruction, AgentTask } = await loadAstroDb();
  const allAgents = await db.select().from(AgentInstruction);
  const candidates = allAgents.filter((a) =>
    String(a.agentId || '').toUpperCase().includes(FORGE_PROJECT_CHILD_TOKEN),
  );
  if (!candidates.length) return { scanned: 0, removed: [] };

  const allTasks = await db.select().from(AgentTask).limit(1500);
  const nowMs = Date.now();
  const ttlMs = SUBAGENT_IDLE_TTL_DAYS * 24 * 60 * 60 * 1000;
  const removed: string[] = [];

  for (const agent of candidates) {
    const agentId = String(agent.agentId || '').trim();
    if (!agentId) continue;
    const tasks = allTasks.filter((t) => String(t.agentId || '').trim() === agentId);
    const hasOpenTasks = tasks.some((t) => {
      const st = String(t.status || '').toLowerCase();
      return !TERMINAL_TASK_STATUSES.has(st);
    });
    if (hasOpenTasks) continue;

    const lastTaskUpdateMs = tasks.reduce((acc, t) => {
      const ms = t.updatedAt instanceof Date ? t.updatedAt.getTime() : new Date(String(t.updatedAt)).getTime();
      return Number.isFinite(ms) ? Math.max(acc, ms) : acc;
    }, 0);
    const fallbackAgentUpdatedAtMs =
      agent.updatedAt instanceof Date ? agent.updatedAt.getTime() : new Date(String(agent.updatedAt)).getTime();
    const lastSeenMs = Math.max(
      Number.isFinite(lastTaskUpdateMs) ? lastTaskUpdateMs : 0,
      Number.isFinite(fallbackAgentUpdatedAtMs) ? fallbackAgentUpdatedAtMs : 0,
    );
    if (lastSeenMs <= 0) continue;
    if (nowMs - lastSeenMs < ttlMs) continue;

    await db.delete(AgentInstruction).where(eq(AgentInstruction.agentId, agentId));
    removed.push(agentId);
    await insertForgeActivityLog({
      actorType: 'system',
      actorId: 'work_scheduler',
      action: 'swarm.subagent.project_deleted_idle',
      entityType: 'agent_instruction',
      entityId: agentId,
      details: {
        reason: 'idle_ttl',
        ttlDays: SUBAGENT_IDLE_TTL_DAYS,
        openTasks: 0,
      },
    });
  }

  return { scanned: candidates.length, removed };
}

/** Si `agentId` est un agent enfant projet (`…__APP_…`), retourne l’identifiant parent Forge ; sinon null. */
export function parseForgeParentAgentId(agentId: string): string | null {
  const s = String(agentId || '');
  const idx = s.toUpperCase().indexOf(FORGE_PROJECT_CHILD_TOKEN.toUpperCase());
  if (idx < 1) return null;
  return s.slice(0, idx);
}

/** Libellé lisible du scope projet (suffixe après `__APP_`). */
export function formatForgeProjectScopeLabel(agentId: string): string {
  const s = String(agentId || '');
  const idx = s.indexOf(FORGE_PROJECT_CHILD_TOKEN);
  if (idx < 0) return '';
  const tail = s.slice(idx + FORGE_PROJECT_CHILD_TOKEN.length);
  const pretty = tail.replace(/_/g, ' ').trim();
  return pretty || 'Application';
}

/** Instructions Forge des agents enfants `PARENT__APP_*` pour un agent parent. */
export async function listForgeProjectScopedChildAgents(parentAgentId: string): Promise<
  { agentId: string; model: string; enabled: number; projectLabel: string }[]
> {
  const parent = String(parentAgentId || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, '_')
    .replace(/^_+|_+$/g, '');
  const prefix = `${parent}${FORGE_PROJECT_CHILD_TOKEN}`;
  if (!parent) return [];

  const { db, AgentInstruction } = await loadAstroDb();
  const rows = await db.select().from(AgentInstruction);
  const pfx = prefix.toUpperCase();
  return rows
    .filter((r) => String(r.agentId || '').toUpperCase().startsWith(pfx))
    .map((r) => ({
      agentId: String(r.agentId),
      model: String(r.model || ''),
      enabled: Number(r.enabled) ? 1 : 0,
      projectLabel: formatForgeProjectScopeLabel(String(r.agentId)),
    }));
}
