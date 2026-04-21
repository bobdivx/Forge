/**
 * forge-hook.ts — Webhook public pour agents locaux.
 *
 * Endpoint NON authentifié accessible depuis 127.0.0.1 uniquement.
 * Permet aux agents (via curl/fetch depuis le ZimaCube) de :
 *   - Remonter des bugs / demandes de correction
 *   - Signaler la fin d'une tâche
 *   - Écrire en mémoire persistante
 *   - Envoyer un message inter-agents
 *   - Demander une directive à Bob
 *   - Démarrer / arrêter un serveur de développement (type: dev_server_control)
 *
 * Format POST :
 * {
 *   agentId:  string          // ex: "TESTEUR_QA"
 *   type:     'bug' | 'task' | 'completion' | 'memory' | 'message' | 'request'
 *            | 'app_issue' | 'dependency_request' | 'app_issue_status' | 'dependency_status'
 *            | 'feature_status'
 *            | 'dev_server_control'
 *   title:    string          // résumé court (obligatoire)
 *   content:  string          // détail complet (obligatoire)
 *   priority?: 'low' | 'medium' | 'high' | 'critical'
 *   taskId?:  number          // pour 'completion' — id AgentTask à passer en « completed »
 *   to?:      string          // pour 'message' — agent destinataire
 *   project?: string          // nom du projet concerné
 *   // Pour dev_server_control :
 *   action?:  'start' | 'stop' | 'status'
 *   serverId?: string         // id du serveur dans .forge/config.json (défaut: premier serveur)
 * }
 */
import type { APIRoute } from 'astro';
import { spawn } from 'child_process';
import fs from 'fs';
import net from 'net';
import path from 'path';
import { loadAstroDb } from '../../lib/load-astro-db';
import { resolveProjectPathVariants } from '../../lib/forge-repos';
import { readAppDashboardConfig, devPidsDir } from '../../lib/project-app-config';
import {
  normalizeAppIssueStatus,
  normalizeDependencyStatus,
  normalizeErrorType,
} from '../../lib/forge-agent-work';
import { finalizeAgentTaskStatus } from '../../lib/forge-task-status-sync';

// ── Helpers dev-server (dupliqués depuis dev-server.ts pour accès interne) ────

function devPidFile(projectPath: string, srvId: string) {
  return path.join(devPidsDir(projectPath), `${srvId}.pid`);
}
function devLogFile(projectPath: string, srvId: string) {
  return path.join(devPidsDir(projectPath), `${srvId}.log`);
}
function readDevPid(projectPath: string, srvId: string): number | null {
  try {
    const f = devPidFile(projectPath, srvId);
    if (!fs.existsSync(f)) return null;
    const n = parseInt(fs.readFileSync(f, 'utf-8').trim(), 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch { return null; }
}
function isDevProcAlive(pid: number): boolean {
  try { process.kill(pid, 0); return true; } catch { return false; }
}
function isPortListeningLocal(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const s = new net.Socket();
    s.setTimeout(300);
    s.once('connect', () => { s.destroy(); resolve(true); });
    s.once('timeout', () => { s.destroy(); resolve(false); });
    s.once('error', () => { s.destroy(); resolve(false); });
    s.connect(port, '127.0.0.1');
  });
}

const ALLOWED_TYPES = [
  'bug',
  'task',
  'completion',
  'memory',
  'message',
  'request',
  'app_issue',
  'dependency_request',
  'app_issue_status',
  'dependency_status',
  'feature_proposal',
  'feature_status',
  'dev_server_control',
] as const;
type HookType = (typeof ALLOWED_TYPES)[number];

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function normalizeHookClientIp(addr: string | undefined): string {
  if (!addr) return '';
  const s = addr.trim();
  return s.startsWith('::ffff:') ? s.slice(7) : s;
}

export const POST: APIRoute = async ({ request, clientAddress }) => {
  // Sécurité : uniquement depuis le réseau local / loopback
  const ip = normalizeHookClientIp(clientAddress);
  const isLocal =
    ip === '127.0.0.1' ||
    ip === '::1' ||
    ip.startsWith('192.168.') ||
    ip.startsWith('10.') ||
    ip.startsWith('172.');

  if (!isLocal) {
    return json({ error: 'forge-hook réservé au réseau local' }, 403);
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Corps JSON invalide' }, 400);
  }

  const {
    agentId,
    type,
    title,
    content,
    priority = 'medium',
    taskId,
    to,
    project,
    url,
    errorType,
    packageName,
    versionSpec,
    isDev,
    assigneeAgentId,
    issueId,
    requestId,
    status: bodyStatus,
    featureId,
  } = body ?? {};

  if (!agentId || !type) {
    return json({ error: 'Champs requis : agentId, type' }, 400);
  }

  const isStatusUpdate =
    type === 'app_issue_status' || type === 'dependency_status' || type === 'feature_status';
  if (isStatusUpdate) {
    if (type === 'app_issue_status' && (issueId == null || bodyStatus == null)) {
      return json({ error: 'app_issue_status requiert issueId et status' }, 400);
    }
    if (type === 'dependency_status' && (requestId == null || bodyStatus == null)) {
      return json({ error: 'dependency_status requiert requestId et status' }, 400);
    }
    if (type === 'feature_status' && (featureId == null || bodyStatus == null)) {
      return json({ error: 'feature_status requiert featureId et status' }, 400);
    }
  } else if (!title || content == null || content === '') {
    return json(
      { error: 'Champs requis : title, content (sauf app_issue_status / dependency_status)' },
      400,
    );
  }

  if (!ALLOWED_TYPES.includes(type as HookType)) {
    return json(
      { error: `type invalide. Valeurs: ${ALLOWED_TYPES.join(', ')}` },
      400,
    );
  }

  const now = new Date();
  const projectTag = project ? ` [${project}]` : '';

  const { db, AgentTask, AgentMessage, AgentMemory, AgentAppIssue, AgentDependencyRequest, Request, Project, eq } =
    await loadAstroDb();

  try {
    // ── Proposition de fonctionnalité / Amélioration ─────────────────────
    if (type === 'feature_proposal' || (type === 'request' && project)) {
      let projectId: number | undefined;
      if (project) {
        const projects = await db.select().from(Project);
        const pRow = projects.find(p => p.name.toLowerCase() === String(project).toLowerCase());
        projectId = pRow?.id;
      }

      if (!projectId) {
        // Fallback or error? For now, let's just use a default or first project if not found?
        // Actually, let's keep it as AgentTask if project not found, to avoid losing data.
        if (type === 'feature_proposal') {
           return json({ error: `Projet '${project}' introuvable pour la proposition.` }, 404);
        }
      } else {
        await db.insert(Request).values({
          projectId: projectId,
          title: String(title).slice(0, 500),
          content: String(content),
          status: 'pending',
          priority: (priority as any) || 'medium',
          author: String(agentId),
          requestType: 'Fonctionnalite',
          assigneeAgentId: String(assigneeAgentId || 'CHEF_TECHNIQUE').trim() || 'CHEF_TECHNIQUE',
          createdAt: now,
          updatedAt: now,
        });
        await db.insert(AgentMessage).values({
          fromAgent: String(agentId),
          toAgent: 'CHEF_TECHNIQUE',
          content: `💡 Nouvelle proposition pour ${project} : ${title}`,
          timestamp: now,
        });
        return json({ ok: true, message: `Proposition enregistrée pour ${project}`, type });
      }
    }

    // ── Mise à jour proposition fonctionnalité (carnet Request) ─────────────
    if (type === 'feature_status') {
      const featureStatus = String(bodyStatus || '').trim().toLowerCase();
      const map: Record<string, string> = {
        pending: 'pending',
        in_progress: 'in_progress',
        running: 'in_progress',
        completed: 'completed',
        done: 'completed',
        failed: 'pending',
        rejected: 'rejected',
        cancelled: 'rejected',
      };
      const next = map[featureStatus];
      if (!next) {
        return json({ error: 'status invalide pour feature_status' }, 400);
      }
      const idNum = Number(featureId);
      if (!Number.isFinite(idNum) || idNum < 1) {
        return json({ error: 'featureId invalide' }, 400);
      }
      const existing = await db.select().from(Request).where(eq(Request.id, idNum)).limit(1);
      if (!existing.length) return json({ error: `Feature #${idNum} introuvable` }, 404);
      const prevContent = String(existing[0].content || '');
      const note = String(content || '').trim();
      const mergedContent = note
        ? `${prevContent}\n\n---\nMise à jour ${agentId} (${now.toISOString()}):\n${note}`.slice(0, 8000)
        : prevContent;
      await db
        .update(Request)
        .set({ status: next, content: mergedContent, updatedAt: now })
        .where(eq(Request.id, idNum));
      await db.insert(AgentMessage).values({
        fromAgent: String(agentId),
        toAgent: 'CHEF_TECHNIQUE',
        content: `[Feature #${idNum}] → ${next}${note ? ` — ${note.slice(0, 300)}` : ''}`,
        timestamp: now,
      });
      return json({ ok: true, message: `Feature #${idNum} → ${next}`, type });
    }

    // ── Mise à jour anomalie page ─────────────────────────────────────────
    if (type === 'app_issue_status') {
      const st = normalizeAppIssueStatus(String(bodyStatus));
      if (!st) {
        return json({ error: 'status invalide pour app_issue' }, 400);
      }
      const assignee =
        assigneeAgentId != null ? String(assigneeAgentId).trim() || null : undefined;
      await db
        .update(AgentAppIssue)
        .set({
          status: st,
          ...(assignee !== undefined ? { assigneeAgentId: assignee } : {}),
          updatedAt: now,
        })
        .where(eq(AgentAppIssue.id, Number(issueId)));
      await db.insert(AgentMessage).values({
        fromAgent: String(agentId),
        toAgent: 'CHEF_TECHNIQUE',
        content: `[AppIssue #${issueId}] → ${st}${content ? ` — ${String(content).slice(0, 400)}` : ''}`,
        timestamp: now,
      });
      return json({ ok: true, message: `Issue #${issueId} → ${st}`, type });
    }

    // ── Mise à jour demande dépendance ─────────────────────────────────────
    if (type === 'dependency_status') {
      const st = normalizeDependencyStatus(String(bodyStatus));
      if (!st) {
        return json({ error: 'status invalide pour dependency' }, 400);
      }
      const assignee =
        assigneeAgentId != null ? String(assigneeAgentId).trim() || null : undefined;
      await db
        .update(AgentDependencyRequest)
        .set({
          status: st,
          ...(assignee !== undefined ? { assigneeAgentId: assignee } : {}),
          updatedAt: now,
        })
        .where(eq(AgentDependencyRequest.id, Number(requestId)));
      await db.insert(AgentMessage).values({
        fromAgent: String(agentId),
        toAgent: 'CHEF_TECHNIQUE',
        content: `[DepRequest #${requestId}] → ${st}${content ? ` — ${String(content).slice(0, 400)}` : ''}`,
        timestamp: now,
      });
      return json({ ok: true, message: `Dependency #${requestId} → ${st}`, type });
    }

    // ── Anomalie page / app (Astro, 404, build…) ──────────────────────────
    if (type === 'app_issue') {
      const u = String(url || '').trim();
      if (!u) {
        return json({ error: 'app_issue requiert le champ url' }, 400);
      }
      const et = normalizeErrorType(String(errorType || 'other'));
      const assignee =
        assigneeAgentId != null ? String(assigneeAgentId).trim() : undefined;
      const [row] = await db
        .insert(AgentAppIssue)
        .values({
          url: u,
          errorType: et,
          title: String(title),
          detail: String(content),
          status: 'open',
          reportedByAgentId: String(agentId),
          assigneeAgentId: assignee || undefined,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      await db.insert(AgentMessage).values({
        fromAgent: String(agentId),
        toAgent: assignee || 'CHEF_TECHNIQUE',
        content: `[AppIssue #${row?.id ?? '?'}] ${et} ${u} — ${String(title)}`,
        timestamp: now,
      });
      return json({ ok: true, message: `Anomalie enregistrée (#${row?.id})`, type, id: row?.id });
    }

    // ── Demande d’installation dépendance ──────────────────────────────────
    if (type === 'dependency_request') {
      const pkg = String(packageName || title).trim();
      const devFlag =
        isDev === true || isDev === 1 || String(isDev) === '1' || String(isDev) === 'true' ? 1 : 0;
      const assignee =
        assigneeAgentId != null ? String(assigneeAgentId).trim() : undefined;
      const [row] = await db
        .insert(AgentDependencyRequest)
        .values({
          packageName: pkg,
          versionSpec: versionSpec != null ? String(versionSpec) : undefined,
          isDev: devFlag,
          reason: String(content),
          status: 'open',
          requestedByAgentId: String(agentId),
          assigneeAgentId: assignee || undefined,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      const target = assignee || 'DEV_BACKEND';
      await db.insert(AgentMessage).values({
        fromAgent: String(agentId),
        toAgent: target,
        content: `[DepRequest #${row?.id ?? '?'}] ${pkg}${versionSpec ? `@${versionSpec}` : ''} (dev=${devFlag})`,
        timestamp: now,
      });
      return json({
        ok: true,
        message: `Demande dépendance enregistrée (#${row?.id})`,
        type,
        id: row?.id,
      });
    }

    // ── bug / task / request / completion → AgentTask ─────────────────────
    if (type === 'bug' || type === 'task' || type === 'request') {
      const statusMap: Record<string, string> = {
        bug: 'bug',
        task: 'pending',
        request: 'pending',
      };
      let projectId: number | undefined;
      if (project) {
        const projects = await db.select().from(Project);
        const pRow = projects.find(p => p.name.toLowerCase() === String(project).toLowerCase());
        projectId = pRow?.id;
      }

      await db.insert(AgentTask).values({
        agentId: String(agentId),
        task: `${String(title)}${projectTag}`,
        input: String(content),
        projectId: projectId,
        status: statusMap[type as string] ?? 'pending',
        createdAt: now,
        updatedAt: now,
      });

      // Écriture mémoire automatique pour les bugs
      if (type === 'bug') {
        await db.insert(AgentMemory).values({
          agentId: 'CHEF_TECHNIQUE',
          content: `[BUG ${priority.toUpperCase()}] ${agentId}: ${title}${projectTag} — ${content.slice(0, 200)}`,
          tags: JSON.stringify(['bug', priority, agentId]),
          createdAt: now,
        });
      }

      return json({
        ok: true,
        message: `${type} enregistré pour ${agentId}`,
        type,
      });
    }

    // ── completion → mise à jour AgentTask ────────────────────────────────
    if (type === 'completion') {
      const safeOut = String(content).slice(0, 12000);
      const tidRaw = taskId != null && String(taskId).trim() !== '' ? Number(taskId) : NaN;
      if (taskId != null && String(taskId).trim() !== '') {
        if (!Number.isFinite(tidRaw)) {
          return json({ error: 'taskId doit être un nombre entier (id AgentTask)' }, 400);
        }
        const fin = await finalizeAgentTaskStatus(tidRaw, 'completed', safeOut);
        if (!fin.ok) {
          return json({ error: fin.error || 'Impossible de mettre à jour la tâche' }, 400);
        }
        await db.insert(AgentMessage).values({
          fromAgent: String(agentId),
          toAgent: 'CHEF_TECHNIQUE',
          content: `✅ TÂCHE TERMINÉE [#${tidRaw}] — ${title}${projectTag}: ${content.slice(0, 500)}`,
          timestamp: now,
        });
        return json({
          ok: true,
          message: `Tâche #${tidRaw} marquée complétée pour ${agentId}`,
          type,
          taskId: tidRaw,
        });
      }
      // Sans taskId : entrée « journal » complétée seule (anciens scripts / agents sans id)
      await db.insert(AgentTask).values({
        agentId: String(agentId),
        task: `✅ ${String(title)}${projectTag}`,
        input: String(content),
        status: 'completed',
        createdAt: now,
        updatedAt: now,
      });
      return json({ ok: true, message: `Completion enregistrée pour ${agentId} (sans taskId)`, type });
    }

    // ── memory → AgentMemory ──────────────────────────────────────────────
    if (type === 'memory') {
      await db.insert(AgentMemory).values({
        agentId: String(agentId),
        content: `${String(title)} — ${String(content)}`,
        tags: project ? JSON.stringify([project]) : null,
        createdAt: now,
      });
      return json({ ok: true, message: `Mémoire enregistrée pour ${agentId}`, type });
    }

    // ── message → AgentMessage ────────────────────────────────────────────
    if (type === 'message') {
      await db.insert(AgentMessage).values({
        fromAgent: String(agentId),
        toAgent: to ? String(to) : 'CHEF_TECHNIQUE',
        content: `[${String(title)}${projectTag}] ${String(content)}`,
        timestamp: now,
      });
      return json({ ok: true, message: `Message envoyé de ${agentId} vers ${to ?? 'CHEF_TECHNIQUE'}`, type });
    }

    // ── Contrôle serveur de développement ────────────────────────────────
    if (type === 'dev_server_control') {
      const action = String(body?.action ?? 'status');
      const projectName = String(project ?? '').trim();
      if (!projectName) return json({ error: 'dev_server_control requiert le champ project' }, 400);
      if (!['start', 'stop', 'status'].includes(action)) {
        return json({ error: 'action invalide (start | stop | status)' }, 400);
      }
      const projectPath = await resolveProjectPathVariants(projectName);
      if (!projectPath) return json({ error: `Projet "${projectName}" introuvable` }, 404);

      const config = readAppDashboardConfig(projectPath);
      const servers = config.servers ?? [];
      const srvId = String(body?.serverId ?? servers[0]?.id ?? '').trim();
      const server = servers.find((s: any) => s.id === srvId) ?? servers[0];
      if (!server) return json({ error: `Aucun serveur configuré pour "${projectName}"` }, 404);

      const pidsDir = devPidsDir(projectPath);
      fs.mkdirSync(pidsDir, { recursive: true });

      if (action === 'status') {
        const pid = readDevPid(projectPath, server.id);
        const pidAlive = pid != null && isDevProcAlive(pid);
        const portBusy = !pidAlive ? await isPortListeningLocal(server.port) : false;
        const running = pidAlive || portBusy;
        await db.insert(AgentMessage).values({
          fromAgent: String(agentId),
          toAgent: 'FORGE',
          content: `[dev_server] ${projectName}/${server.id} → ${running ? 'running' : 'stopped'} (port ${server.port})`,
          timestamp: now,
        });
        return json({ ok: true, serverId: server.id, running, pid: pidAlive ? pid : null, port: server.port, externalProcess: portBusy && !pidAlive });
      }

      if (action === 'stop') {
        const pid = readDevPid(projectPath, server.id);
        if (pid != null && isDevProcAlive(pid)) {
          try { process.kill(pid, 'SIGTERM'); } catch { /* ignore */ }
          try { fs.unlinkSync(devPidFile(projectPath, server.id)); } catch { /* ignore */ }
          await db.insert(AgentMessage).values({
            fromAgent: String(agentId), toAgent: 'FORGE',
            content: `[dev_server] STOP ${projectName}/${server.id} (PID ${pid})`, timestamp: now,
          });
          return json({ ok: true, stopped: true, pid, serverId: server.id });
        }
        return json({ ok: true, stopped: false, message: 'Déjà arrêté', serverId: server.id });
      }

      // action === 'start'
      const existingPid = readDevPid(projectPath, server.id);
      if (existingPid != null && isDevProcAlive(existingPid)) {
        return json({ ok: false, error: 'Déjà en cours', pid: existingPid, port: server.port, serverId: server.id });
      }
      const portBusy = await isPortListeningLocal(server.port);
      if (portBusy) {
        return json({ ok: false, error: `Port ${server.port} déjà occupé (serveur externe actif)`, port: server.port, serverId: server.id });
      }
      const logF = devLogFile(projectPath, server.id);
      let fd: number;
      try { fd = fs.openSync(logF, 'a'); } catch {
        return json({ error: 'Impossible de créer le fichier de log' }, 500);
      }
      const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
      const child = spawn(npmCmd, ['run', server.npmScript], {
        cwd: projectPath, detached: true, stdio: ['ignore', fd, fd],
        shell: false, env: { ...process.env, FORCE_COLOR: '0' },
      });
      try { fs.closeSync(fd); } catch { /* ignore */ }
      child.unref();
      if (!child.pid) return json({ error: 'Échec du lancement npm' }, 500);
      fs.writeFileSync(devPidFile(projectPath, server.id), String(child.pid), 'utf-8');
      await db.insert(AgentMessage).values({
        fromAgent: String(agentId), toAgent: 'FORGE',
        content: `[dev_server] START ${projectName}/${server.id} npm run ${server.npmScript} → PID ${child.pid} port ${server.port}`,
        timestamp: now,
      });
      return json({ ok: true, pid: child.pid, port: server.port, npmScript: server.npmScript, serverId: server.id, logFile: path.basename(logF) });
    }

    return json({ error: 'Type non traité' }, 400);
  } catch (e: any) {
    return json({ error: `Erreur DB: ${e.message}` }, 500);
  }
};

/** GET — santé du hook, utilisé par les agents pour tester la connexion. */
export const GET: APIRoute = async ({ clientAddress }) => {
  return json({
    ok: true,
    service: 'forge-hook',
    version: '1.1',
    clientAddress,
    message: 'Forge Hook actif. POST pour reporter bugs, tâches, mémoires, et contrôler les serveurs.',
    types: ALLOWED_TYPES,
    structuredApis: 'POST /api/agent-issues · /api/agent-dependencies (réseau local, JSON)',
    examples: {
      dev_server_start: {
        agentId: 'CHEF_TECHNIQUE',
        type: 'dev_server_control',
        title: 'Démarrer serveur dev',
        content: 'Lancement du serveur de développement',
        project: 'Forge',
        action: 'start',
      },
      dev_server_status: {
        agentId: 'CHEF_TECHNIQUE',
        type: 'dev_server_control',
        title: 'Statut serveur',
        content: 'Vérification statut',
        project: 'Forge',
        action: 'status',
      },
    },
  });
};
