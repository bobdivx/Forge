/**
 * Daemon Forge Tech Watch.
 *
 * Tourne en arrière-plan et inspecte :
 *  - les dépendances obsolètes (`npm outdated --json` ou équivalent)
 *  - les advisories npm (`npm audit --json`)
 *  - (à venir) des flux RSS configurables
 *
 * Produit des `TechWatchSuggestion` (low/medium/high/critical) et convertit
 * les suggestions `high`/`critical` en `Request` du carnet.
 */
import { and, desc, eq, gte } from 'drizzle-orm';
import { loadAstroDb } from './load-astro-db';
import { getConfig } from './config-db';
import { resolveProjectPathFromDbProject } from './forge-repos';
import { getZimaOSInfraClient } from './forge-infra-client';
import { insertForgeActivityLog } from './forge-activity-log';

export type TechWatchStatus = {
  running: boolean;
  intervalMinutes: number;
  lastRunAt: string | null;
  lastRunDurationMs: number | null;
  lastRunSuggestions: number;
  lastRunError: string | null;
  nextRunAt: string | null;
};

declare global {
  var __forgeTechWatch:
    | {
        timer: NodeJS.Timeout | null;
        running: boolean;
        intervalMinutes: number;
        lastRunAt: Date | null;
        lastRunDurationMs: number | null;
        lastRunSuggestions: number;
        lastRunError: string | null;
      }
    | undefined;
}

function getState() {
  if (!globalThis.__forgeTechWatch) {
    globalThis.__forgeTechWatch = {
      timer: null,
      running: false,
      intervalMinutes: 360,
      lastRunAt: null,
      lastRunDurationMs: null,
      lastRunSuggestions: 0,
      lastRunError: null,
    };
  }
  return globalThis.__forgeTechWatch;
}

type OutdatedEntry = {
  current?: string;
  wanted?: string;
  latest?: string;
};

function classifyVersionBump(current: string, latest: string): 'major' | 'minor' | 'patch' {
  const curParts = current.replace(/^\^|~/g, '').split('.').map((n) => Number(n) || 0);
  const newParts = latest.split('.').map((n) => Number(n) || 0);
  if ((newParts[0] || 0) > (curParts[0] || 0)) return 'major';
  if ((newParts[1] || 0) > (curParts[1] || 0)) return 'minor';
  return 'patch';
}

function impactFromBump(bump: 'major' | 'minor' | 'patch'): 'low' | 'medium' | 'high' {
  if (bump === 'major') return 'medium';
  return 'low';
}

function impactFromSeverity(severity: string): 'low' | 'medium' | 'high' | 'critical' {
  const s = String(severity || '').toLowerCase();
  if (s === 'critical') return 'critical';
  if (s === 'high') return 'high';
  if (s === 'moderate') return 'medium';
  return 'low';
}

function safeJsonParse<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function scanProjectOutdated(projectPath: string): Promise<Array<{
  packageName: string;
  current: string;
  latest: string;
  impact: 'low' | 'medium' | 'high';
}>> {
  const infra = await getZimaOSInfraClient();
  try {
    // `npm outdated` retourne exit code 1 quand il y a des outdated.
    // On exec via `|| true` pour ne pas throw.
    const raw = infra.exec(`cd "${projectPath}" && (npm outdated --json 2>/dev/null || true)`);
    const parsed = safeJsonParse<Record<string, OutdatedEntry>>(raw || '{}') || {};
    const out: Array<{ packageName: string; current: string; latest: string; impact: 'low' | 'medium' | 'high' }> = [];
    for (const [pkg, entry] of Object.entries(parsed)) {
      if (!entry?.current || !entry?.latest) continue;
      const bump = classifyVersionBump(entry.current, entry.latest);
      out.push({
        packageName: pkg,
        current: entry.current,
        latest: entry.latest,
        impact: impactFromBump(bump),
      });
    }
    return out;
  } catch {
    return [];
  }
}

async function scanProjectAudit(projectPath: string): Promise<Array<{
  packageName: string;
  severity: string;
  impact: 'low' | 'medium' | 'high' | 'critical';
  title: string;
}>> {
  const infra = await getZimaOSInfraClient();
  try {
    const raw = infra.exec(`cd "${projectPath}" && (npm audit --json 2>/dev/null || true)`);
    const parsed = safeJsonParse<{ vulnerabilities?: Record<string, { name?: string; severity?: string; via?: Array<{ title?: string; severity?: string }> }> }>(raw || '{}') || {};
    const vulns = parsed.vulnerabilities || {};
    const out: Array<{ packageName: string; severity: string; impact: 'low' | 'medium' | 'high' | 'critical'; title: string }> = [];
    for (const [name, v] of Object.entries(vulns)) {
      const sev = v.severity || 'low';
      const via = Array.isArray(v.via) ? v.via : [];
      const title = via.find((x) => x.title)?.title || `Vulnérabilité ${sev} dans ${name}`;
      out.push({
        packageName: name,
        severity: sev,
        impact: impactFromSeverity(sev),
        title,
      });
    }
    return out;
  } catch {
    return [];
  }
}

export async function runTechWatchNow(): Promise<{ ok: boolean; suggestions: number; error?: string }> {
  const state = getState();
  state.running = true;
  const start = Date.now();
  try {
    const { db, Project, TechWatchSuggestion, Request } = await loadAstroDb();
    const projects = await db.select().from(Project).where(eq(Project.status, 'active'));
    let total = 0;
    const since = new Date(Date.now() - 24 * 3600 * 1000);
    for (const project of projects) {
      const projectPath = await resolveProjectPathFromDbProject(project as never);
      if (!projectPath) continue;
      const outdated = await scanProjectOutdated(projectPath);
      const audit = await scanProjectAudit(projectPath);

      for (const o of outdated) {
        if (TechWatchSuggestion) {
          const recent = await db
            .select()
            .from(TechWatchSuggestion)
            .where(
              and(
                eq(TechWatchSuggestion.projectId, project.id),
                eq(TechWatchSuggestion.kind, 'outdated'),
                eq(TechWatchSuggestion.packageName, o.packageName),
                gte(TechWatchSuggestion.createdAt, since),
              ),
            );
          if (recent.length > 0) continue;
        }
        const now = new Date();
        let requestId: number | null = null;
        if (o.impact === 'high') {
          const inserted = await db
            .insert(Request)
            .values({
              projectId: project.id,
              title: `[Veille] Mettre à jour ${o.packageName} (${o.current} → ${o.latest})`.slice(0, 200),
              content: `Mise à jour majeure recommandée.\n${o.packageName} : ${o.current} → ${o.latest}`,
              status: 'pending',
              priority: 'low',
              author: 'tech_watch',
              requestType: 'Fonctionnalite',
              assigneeAgentId: 'VEILLE_TECH',
              createdAt: now,
              updatedAt: now,
            })
            .returning({ id: Request.id });
          requestId = inserted[0]?.id ?? null;
        }
        if (TechWatchSuggestion) {
          await db.insert(TechWatchSuggestion).values({
            projectId: project.id,
            kind: 'outdated',
            packageName: o.packageName,
            currentVersion: o.current,
            latestVersion: o.latest,
            impact: o.impact,
            title: `${o.packageName} ${o.current} → ${o.latest}`,
            detail: `Bump détecté par npm outdated.`,
            requestId,
            status: requestId ? 'converted_to_request' : 'open',
            createdAt: now,
            updatedAt: now,
          });
          total++;
        }
      }

      for (const a of audit) {
        if (TechWatchSuggestion) {
          const recent = await db
            .select()
            .from(TechWatchSuggestion)
            .where(
              and(
                eq(TechWatchSuggestion.projectId, project.id),
                eq(TechWatchSuggestion.kind, 'advisory'),
                eq(TechWatchSuggestion.packageName, a.packageName),
                gte(TechWatchSuggestion.createdAt, since),
              ),
            );
          if (recent.length > 0) continue;
        }
        const now = new Date();
        let requestId: number | null = null;
        if (a.impact === 'critical' || a.impact === 'high') {
          const inserted = await db
            .insert(Request)
            .values({
              projectId: project.id,
              title: `[Sécurité] ${a.packageName} (${a.severity})`.slice(0, 200),
              content: `${a.title}\n\nVulnérabilité ${a.severity} détectée par npm audit sur ${a.packageName}.`,
              status: 'pending',
              priority: a.impact === 'critical' ? 'high' : 'medium',
              author: 'tech_watch',
              requestType: 'Correction',
              assigneeAgentId: 'SECURITE_CODE',
              createdAt: now,
              updatedAt: now,
            })
            .returning({ id: Request.id });
          requestId = inserted[0]?.id ?? null;
        }
        if (TechWatchSuggestion) {
          await db.insert(TechWatchSuggestion).values({
            projectId: project.id,
            kind: 'advisory',
            packageName: a.packageName,
            severity: a.severity,
            impact: a.impact,
            title: a.title.slice(0, 200),
            detail: `Détectée par npm audit (severity=${a.severity}).`,
            requestId,
            status: requestId ? 'converted_to_request' : 'open',
            createdAt: now,
            updatedAt: now,
          });
          total++;
        }
      }
    }
    state.lastRunSuggestions = total;
    state.lastRunError = null;
    await insertForgeActivityLog({
      actorType: 'system',
      actorId: 'tech_watch',
      action: 'tech_watch.run_ok',
      entityType: 'daemon',
      entityId: 'tech_watch',
      details: { suggestions: total, durationMs: Date.now() - start },
    });
    return { ok: true, suggestions: total };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    state.lastRunError = msg;
    return { ok: false, suggestions: 0, error: msg };
  } finally {
    state.lastRunDurationMs = Date.now() - start;
    state.lastRunAt = new Date();
    state.running = false;
  }
}

export async function startTechWatch(): Promise<void> {
  const state = getState();
  if (state.timer) return;
  const enabled = (await getConfig('techWatchEnabled')).toLowerCase() === 'true';
  if (!enabled) return;
  const intervalMinutes = Math.max(15, Number(await getConfig('techWatchIntervalMinutes')) || 360);
  state.intervalMinutes = intervalMinutes;
  // Différé : premier run dans 5 min pour ne pas bloquer le boot.
  setTimeout(() => void runTechWatchNow().catch(() => undefined), 5 * 60_000);
  state.timer = setInterval(() => {
    void runTechWatchNow().catch(() => undefined);
  }, intervalMinutes * 60_000);
}

export function stopTechWatch(): void {
  const state = getState();
  if (state.timer) {
    clearInterval(state.timer);
    state.timer = null;
  }
}

export function getTechWatchStatus(): TechWatchStatus {
  const state = getState();
  const nextRunAt = state.timer && state.lastRunAt
    ? new Date(state.lastRunAt.getTime() + state.intervalMinutes * 60_000).toISOString()
    : null;
  return {
    running: Boolean(state.timer),
    intervalMinutes: state.intervalMinutes,
    lastRunAt: state.lastRunAt ? state.lastRunAt.toISOString() : null,
    lastRunDurationMs: state.lastRunDurationMs,
    lastRunSuggestions: state.lastRunSuggestions,
    lastRunError: state.lastRunError,
    nextRunAt,
  };
}

export async function listRecentTechWatchSuggestions(limit = 100): Promise<Array<Record<string, unknown>>> {
  try {
    const { db, TechWatchSuggestion } = await loadAstroDb();
    if (!TechWatchSuggestion) return [];
    const rows = await db
      .select()
      .from(TechWatchSuggestion)
      .orderBy(desc(TechWatchSuggestion.id))
      .limit(Math.max(1, Math.min(500, limit)));
    return rows as Array<Record<string, unknown>>;
  } catch {
    return [];
  }
}
