/**
 * Agrège des événements lisibles pour la page « Flux Swarm »
 * (journal système, messages inter-agents, état des tâches).
 */

import { desc } from 'drizzle-orm';
import { loadAstroDb } from './load-astro-db';
import { extractForgeRequestIdFromTaskBlob } from './forge-request-routing';

export type SwarmTimelineTone = 'neutral' | 'success' | 'warning' | 'brand' | 'info';

export type SwarmTimelineEventRow = {
  id: string;
  at: string;
  kind: 'system' | 'message' | 'task';
  icon: string;
  title: string;
  body?: string;
  actor?: string;
  target?: string;
  tone: SwarmTimelineTone;
};

function iso(d: Date | string | null | undefined): string {
  if (d == null) return new Date(0).toISOString();
  const t = d instanceof Date ? d : new Date(d);
  return Number.isFinite(t.getTime()) ? t.toISOString() : new Date(0).toISOString();
}

export async function buildSwarmTimelineEvents(): Promise<SwarmTimelineEventRow[]> {
  const { db, ActivityLog, AgentMessage, AgentTask } = await loadAstroDb();
  const out: SwarmTimelineEventRow[] = [];

  const logs = await db.select().from(ActivityLog).orderBy(desc(ActivityLog.createdAt)).limit(60);
  for (const L of logs) {
    const action = String(L.action || '');
    let title = `Événement : ${action}`;
    let icon = '🛰️';
    let tone: SwarmTimelineTone = 'neutral';
    let body: string | undefined = L.details ? String(L.details).slice(0, 420) : undefined;

    const detailsObj = (() => {
      const raw = L.details ? String(L.details) : '';
      if (!raw.trim()) return null as Record<string, unknown> | null;
      try {
        const o = JSON.parse(raw) as unknown;
        return o != null && typeof o === 'object' && !Array.isArray(o)
          ? (o as Record<string, unknown>)
          : null;
      } catch {
        return null;
      }
    })();

    if (action === 'work_cycle.started') {
      title = 'Session de travail démarrée';
      icon = '⚡';
      tone = 'brand';
    } else if (action.startsWith('scheduler.')) {
      title = `Planificateur · ${action.replace(/^scheduler\./, '')}`;
      icon = '🗓️';
      tone = 'warning';
    } else if (action === 'swarm.request.dispatched') {
      title = 'Carnet — demande mise en tâche (agent assigné)';
      icon = '📤';
      tone = 'brand';
      if (detailsObj) {
        const bits = [
          detailsObj.assignee != null ? `Agent : ${detailsObj.assignee}` : '',
          detailsObj.taskId != null ? `Tâche #${detailsObj.taskId}` : '',
          detailsObj.title != null ? String(detailsObj.title).slice(0, 200) : '',
        ].filter(Boolean);
        body = bits.join(' · ') || body;
      }
    } else if (action === 'swarm.task.sent_zimaos') {
      title = 'Tâche poussée vers ZimaOS';
      icon = '▶️';
      tone = 'info';
      if (detailsObj) {
        const bits = [
          detailsObj.sessionKey != null ? `Session : ${detailsObj.sessionKey}` : '',
          detailsObj.taskPreview != null ? String(detailsObj.taskPreview).slice(0, 200) : '',
        ].filter(Boolean);
        body = bits.join(' · ') || body;
      }
    } else if (action === 'swarm.issue.task_created') {
      title = 'Anomalie — nouvelle tâche créée';
      icon = '🐛';
      tone = 'warning';
      if (detailsObj) {
        const bits = [
          detailsObj.appIssueId != null ? `AppIssue #${detailsObj.appIssueId}` : '',
          detailsObj.assignee != null ? `Agent : ${detailsObj.assignee}` : '',
          detailsObj.title != null ? String(detailsObj.title).slice(0, 200) : '',
        ].filter(Boolean);
        body = bits.join(' · ') || body;
      }
    } else if (action === 'carnet.request.created') {
      title = 'Nouvelle entrée au carnet';
      icon = '📝';
      tone = 'info';
    } else if (action === 'carnet.request.status_changed') {
      title = 'Carnet — statut modifié (humain / coordination)';
      icon = '✋';
      tone = 'brand';
      if (detailsObj && detailsObj.from != null && detailsObj.to != null) {
        body = `${detailsObj.from} → ${detailsObj.to}${detailsObj.title ? ` · ${String(detailsObj.title).slice(0, 160)}` : ''}`;
      }
    } else if (action === 'carnet.request.assignee_changed') {
      title = 'Carnet — agent cible modifié';
      icon = '🎯';
      tone = 'info';
      if (detailsObj && (detailsObj.from != null || detailsObj.to != null)) {
        body = `${detailsObj.from ?? '—'} → ${detailsObj.to ?? '—'}`;
      }
    } else if (action === 'carnet.request.synced_from_task') {
      title = 'Carnet — aligné sur une tâche agent';
      icon = '🔗';
      tone = 'success';
      if (detailsObj) {
        const bits = [
          detailsObj.requestStatus != null ? `Carnet : ${detailsObj.requestStatus}` : '',
          detailsObj.taskStatus != null ? `Tâche : ${detailsObj.taskStatus}` : '',
          detailsObj.taskId != null ? `Tâche #${detailsObj.taskId}` : '',
        ].filter(Boolean);
        body = bits.join(' · ') || body;
      }
    } else if (action === 'swarm.task.completed_via_zimaos_scan') {
      title = 'Clôture automatique (FORGE_DONE détecté)';
      icon = '✅';
      tone = 'success';
      if (detailsObj && detailsObj.signal != null) {
        body = `Signal : ${detailsObj.signal}`;
      }
    } else if (action === 'swarm.task.status_manual') {
      title = 'Tâche — mise à jour manuelle (dashboard / API)';
      icon = '✏️';
      tone = 'info';
      if (detailsObj && detailsObj.status != null) {
        body = `Nouveau statut : ${detailsObj.status}`;
      }
    }

    out.push({
      id: `log-${L.id}`,
      at: iso(L.createdAt),
      kind: 'system',
      icon,
      title,
      body,
      actor: L.actorId ? String(L.actorId) : undefined,
      tone,
    });
  }

  const msgs = await db.select().from(AgentMessage).orderBy(desc(AgentMessage.timestamp)).limit(100);
  for (const M of msgs) {
    const c = String(M.content || '');
    const first = c.split('\n')[0]?.trim() || '(message)';
    let title = first.length > 160 ? `${first.slice(0, 159)}…` : first;
    let icon = '💬';
    let tone: SwarmTimelineTone = 'info';
    if (/TÂCHE\s+TERMINÉE|✅\s*TÂCHE/i.test(c)) {
      icon = '✅';
      tone = 'success';
    } else if (/proposition|💡/i.test(c)) {
      icon = '💡';
      tone = 'brand';
    } else if (/relance/i.test(c)) {
      icon = '↻';
      tone = 'warning';
    }
    out.push({
      id: `msg-${M.id}`,
      at: iso(M.timestamp),
      kind: 'message',
      icon,
      title,
      body: c.length > 260 ? `${c.slice(0, 259)}…` : c || undefined,
      actor: M.fromAgent ? String(M.fromAgent) : undefined,
      target: M.toAgent ? String(M.toAgent) : undefined,
      tone,
    });
  }

  const tasks = await db.select().from(AgentTask).orderBy(desc(AgentTask.updatedAt)).limit(40);
  for (const T of tasks) {
    const st = String(T.status || '').toLowerCase();
    const titleLine = String(T.task || '').trim() || `Tâche #${T.id}`;
    const blob = `${T.task ?? ''}\n${T.input ?? ''}`;
    const rid = extractForgeRequestIdFromTaskBlob(blob);
    const isIssue = /AppIssue\s*#/i.test(titleLine);
    let headline =
      rid != null
        ? `Carnet · demande liée (#${rid})`
        : isIssue
          ? 'Bug / anomalie lié(e)'
          : 'Mission agent';
    const statusHuman =
      st === 'completed'
        ? 'terminée'
        : st === 'failed'
          ? 'en échec (nouvelle tentative possible)'
          : st === 'running'
            ? 'en cours sur ZimaOS'
            : st === 'pending'
              ? 'en file d’attente'
              : st;
    headline = `${headline} — ${statusHuman}`;
    let icon = '📌';
    let tone: SwarmTimelineTone = 'neutral';
    if (st === 'completed') {
      icon = '✅';
      tone = 'success';
    } else if (st === 'running') {
      icon = '▶️';
      tone = 'brand';
    } else if (st === 'failed' || st === 'bug') {
      icon = '⚠️';
      tone = 'warning';
    }
    out.push({
      id: `task-${T.id}-${iso(T.updatedAt)}`,
      at: iso(T.updatedAt),
      kind: 'task',
      icon,
      title: headline,
      body: titleLine.length > 200 ? `${titleLine.slice(0, 199)}…` : titleLine,
      actor: String(T.agentId || ''),
      tone,
    });
  }

  out.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  return out.slice(0, 140);
}
