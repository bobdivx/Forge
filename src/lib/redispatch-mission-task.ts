import { eq } from 'drizzle-orm';
import { loadAstroDb } from './load-astro-db';
import { toAgentPath } from './forge-repos';
import { runForgeAgentMessage } from './forge-agent-task-runner';

const MAX_SEND = 120_000;

export type RedispatchResult =
  | { ok: true; task: unknown }
  | { ok: false; error: string; detail?: unknown; hint?: string };

async function buildMissionBody(params: {
  taskId: number;
  agentId: string;
  task: string;
  input: string | null;
  projectId: number | null | undefined;
}): Promise<string> {
  const { taskId, agentId, task, input, projectId } = params;
  const header = `[Forge — relance mission · tâche #${taskId} · agent ${agentId}]\n\n`;
  let projectBlock = '';
  if (projectId != null && Number.isFinite(Number(projectId))) {
    const { db, Project } = await loadAstroDb();
    const [p] = await db.select().from(Project).where(eq(Project.id, Number(projectId))).limit(1);
    if (p) {
      const agentPath = await toAgentPath(String(p.path ?? ''));
      projectBlock = [
        '🎯 APPLICATION / DÉPÔT CIBLE',
        `- Nom : ${p.name}`,
        `- Chemin (vue agent) : ${agentPath}`,
        'Concentre cette mission sur ce dépôt / cette application Forge.',
      ].join('\n');
    }
  }
  const body = [task, projectBlock, input || ''].filter(Boolean).join('\n\n');
  return `${header}${body}`.slice(0, MAX_SEND);
}

/**
 * Relance une ligne AgentTask via l'orchestrateur Forge natif.
 */
export async function runMissionRedispatch(params: {
  taskId: number;
  sessionKey: string;
  email: string | undefined;
}): Promise<RedispatchResult> {
  const { db, AgentTask, eq } = await loadAstroDb();
  const [row] = await db.select().from(AgentTask).where(eq(AgentTask.id, params.taskId)).limit(1);
  if (!row) return { ok: false, error: 'Tâche introuvable' };

  const message = await buildMissionBody({
    taskId: params.taskId,
    agentId: row.agentId,
    task: row.task,
    input: row.input ?? null,
    projectId: row.projectId as number | null | undefined,
  });

  const run = await runForgeAgentMessage({
    agentId: row.agentId,
    message,
    projectId: row.projectId as number | null | undefined,
    taskId: params.taskId,
    actorId: params.email,
    source: 'redispatch',
    sessionId: String(params.sessionKey || '').trim() || undefined,
  });
  if (!run.ok) {
    return {
      ok: false,
      error: run.error || 'Exécution Forge impossible',
      hint: "Vérifiez le modèle de l'agent, Ollama et les journaux de l'orchestrateur Forge.",
    };
  }

  const [updated] = await db.select().from(AgentTask).where(eq(AgentTask.id, params.taskId)).limit(1);
  return { ok: true, task: updated ?? row };
}
