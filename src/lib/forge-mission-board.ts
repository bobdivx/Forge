/**
 * Mission Board — vue unifiée du travail à faire pour tous les agents.
 *
 * Agrège trois sources :
 *  - `Request` (carnet utilisateur + carnet agents)
 *  - `AgentAppIssue` (bugs détectés)
 *  - `TechWatchSuggestion` (veille tech)
 *
 * Mapping vers 5 colonnes × 3 swimlanes (voir design.md).
 */
import { desc, eq } from "drizzle-orm";
import { loadAstroDb } from "./load-astro-db";
import { insertForgeActivityLog } from "./forge-activity-log";

export type Swimlane = "bugs" | "features" | "tech";
export type Column = "backlog" | "triaged" | "in_progress" | "review" | "done";
export type MissionSource = "request" | "app_issue" | "tech_suggestion";
export type MissionItemPriority = "low" | "medium" | "high" | "critical";

export type MissionItem = {
  uid: string;
  source: MissionSource;
  sourceId: number;
  swimlane: Swimlane;
  column: Column;
  title: string;
  summary: string | null;
  projectId: number | null;
  projectName: string | null;
  priority: MissionItemPriority | null;
  assignee: string | null;
  createdAt: string;
  updatedAt: string;
};

export const COLUMNS: Column[] = [
  "backlog",
  "triaged",
  "in_progress",
  "review",
  "done",
];
export const SWIMLANES: Swimlane[] = ["bugs", "features", "tech"];

const emptyCounts = (): Record<Column, number> => ({
  backlog: 0,
  triaged: 0,
  in_progress: 0,
  review: 0,
  done: 0,
});

function priorityFor(
  input: string | null | undefined,
): MissionItemPriority | null {
  if (!input) return null;
  const s = String(input).toLowerCase();
  if (s === "critical") return "critical";
  if (s === "high") return "high";
  if (s === "medium") return "medium";
  if (s === "low") return "low";
  return null;
}

function clipSummary(content: string | null | undefined): string | null {
  if (!content) return null;
  const trimmed = String(content).replace(/\s+/g, " ").trim();
  return trimmed.slice(0, 220);
}

/** Mapping Request → Column. */
export function columnForRequest(r: {
  status: string | null;
  assigneeAgentId?: string | null;
}): Column {
  const s = String(r.status || "").toLowerCase();
  if (
    s === "done" ||
    s === "completed" ||
    s === "cancelled" ||
    s === "rejected"
  )
    return "done";
  if (s === "review") return "review";
  if (s === "in_progress") return "in_progress";
  if (s === "pending") return r.assigneeAgentId ? "triaged" : "backlog";
  return "backlog";
}

/** Mapping AppIssue + task → Column. */
export function columnForAppIssue(
  issue: { status: string | null },
  task: { status: string } | null,
): Column {
  const ist = String(issue.status || "").toLowerCase();
  if (ist === "resolved" || ist === "wont_fix" || ist === "fixed")
    return "done";
  if (ist === "in_review") return "review";
  const ts = task ? String(task.status || "").toLowerCase() : "";
  if (ts === "running") return "in_progress";
  if (ts === "pending" || ts === "bug") return "triaged";
  if (ist === "in_progress") return "in_progress";
  return "backlog";
}

/** Mapping TechWatchSuggestion → Column. */
export function columnForTechSuggestion(s: {
  status: string | null;
  impact: string | null;
}): Column {
  const st = String(s.status || "").toLowerCase();
  if (st === "dismissed") return "done";
  if (st === "converted_to_request") return "in_progress";
  const imp = String(s.impact || "low").toLowerCase();
  if (imp === "high" || imp === "critical") return "triaged";
  return "backlog";
}

function swimlaneForRequest(requestType: string | null | undefined): Swimlane {
  const t = String(requestType || "").toLowerCase();
  if (t === "correction") return "bugs";
  return "features";
}

function _normalizeDate(d: unknown): string {
  if (d instanceof Date) return d.toISOString();
  if (typeof d === "string") {
    const parsed = new Date(d);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
    return d;
  }
  return new Date().toISOString();
}

export type MissionBoardOverview = {
  items: MissionItem[];
  counts: Record<Column, number>;
  bySwimlane: Record<Swimlane, Record<Column, number>>;
  lastSync: string;
};

export async function getMissionBoardOverview(): Promise<MissionBoardOverview> {
  const {
    db,
    Request,
    AgentAppIssue,
    AgentTask,
    TechWatchSuggestion,
    Project,
  } = await loadAstroDb();

  const [projects, requests, issues, tasks, techRows] = await Promise.all([
    db.select().from(Project),
    db.select().from(Request).orderBy(desc(Request.id)).limit(300),
    db.select().from(AgentAppIssue).orderBy(desc(AgentAppIssue.id)).limit(300),
    db.select().from(AgentTask).limit(800),
    TechWatchSuggestion ? db.select().from(TechWatchSuggestion).orderBy(desc(TechWatchSuggestion.id)).limit(200) : Promise.resolve([]),
  ]);

  const projectNames: Record<number, string> = {};
  for (const p of projects) projectNames[p.id] = String(p.name || "");

  // Index task ↔ issue
  const issueTaskMap = new Map<number, { id: number; status: string }>();
  for (const t of tasks) {
    const blob = `${t.task ?? ""}\n${t.input ?? ""}`;
    const m = blob.match(/AppIssue\s*#(\d+)/i);
    if (!m) continue;
    const id = Number(m[1]);
    if (!Number.isFinite(id)) continue;
    const prev = issueTaskMap.get(id);
    if (!prev || String(t.status || "") === "running") {
      issueTaskMap.set(id, { id: t.id, status: String(t.status || "") });
    }
  }

  const items: MissionItem[] = [];

  for (const r of requests) {
    items.push({
      uid: `request:${r.id}`,
      source: "request",
      sourceId: r.id,
      swimlane: swimlaneForRequest(r.requestType),
      column: columnForRequest(r),
      title: String(r.title || "(sans titre)").slice(0, 200),
      summary: clipSummary(r.content),
      projectId: r.projectId ?? null,
      projectName:
        r.projectId != null ? (projectNames[r.projectId] ?? null) : null,
      priority: priorityFor(r.priority),
      assignee: r.assigneeAgentId ? String(r.assigneeAgentId) : null,
      createdAt: _normalizeDate(r.createdAt),
      updatedAt: _normalizeDate(r.updatedAt),
    });
  }

  for (const i of issues) {
    const t = issueTaskMap.get(i.id) ?? null;
    items.push({
      uid: `app_issue:${i.id}`,
      source: "app_issue",
      sourceId: i.id,
      swimlane: "bugs",
      column: columnForAppIssue(i, t),
      title: String(i.title || i.errorType || "Bug").slice(0, 200),
      summary: clipSummary(i.detail),
      projectId: i.projectId ?? null,
      projectName:
        i.projectId != null ? (projectNames[i.projectId] ?? null) : null,
      priority: null,
      assignee: i.assigneeAgentId ? String(i.assigneeAgentId) : null,
      createdAt: _normalizeDate(i.createdAt),
      updatedAt: _normalizeDate(i.updatedAt),
    });
  }

  for (const s of techRows) {
    items.push({
      uid: `tech_suggestion:${s.id}`,
      source: "tech_suggestion",
      sourceId: s.id,
      swimlane: "tech",
      column: columnForTechSuggestion(s),
      title: String(s.title || s.packageName || "Suggestion").slice(0, 200),
      summary: clipSummary(s.detail),
      projectId: s.projectId ?? null,
      projectName:
        s.projectId != null ? (projectNames[s.projectId] ?? null) : null,
      priority: priorityFor(s.impact),
      assignee: null,
      createdAt: _normalizeDate(s.createdAt),
      updatedAt: _normalizeDate(s.updatedAt),
    });
  }

  const counts = emptyCounts();
  const bySwimlane: Record<Swimlane, Record<Column, number>> = {
    bugs: emptyCounts(),
    features: emptyCounts(),
    tech: emptyCounts(),
  };
  for (const it of items) {
    counts[it.column] = (counts[it.column] ?? 0) + 1;
    bySwimlane[it.swimlane][it.column] =
      (bySwimlane[it.swimlane][it.column] ?? 0) + 1;
  }

  return {
    items,
    counts,
    bySwimlane,
    lastSync: new Date().toISOString(),
  };
}

/** Déplace une item vers une autre colonne (interaction utilisateur). */
export async function moveMissionItem(
  uid: string,
  target: Column,
): Promise<{ ok: boolean; error?: string }> {
  if (!COLUMNS.includes(target))
    return { ok: false, error: "colonne invalide" };
  const [source, idStr] = String(uid).split(":");
  const id = Number(idStr);
  if (!source || !Number.isFinite(id))
    return { ok: false, error: "uid invalide" };

  try {
    const { db, Request, AgentAppIssue, TechWatchSuggestion } =
      await loadAstroDb();
    const now = new Date();

    if (source === "request") {
      const status = (() => {
        switch (target) {
          case "backlog":
            return "pending";
          case "triaged":
            return "pending";
          case "in_progress":
            return "in_progress";
          case "review":
            return "review";
          case "done":
            return "completed";
        }
      })();
      await db
        .update(Request)
        .set({ status, updatedAt: now })
        .where(eq(Request.id, id));
    } else if (source === "app_issue") {
      const status = (() => {
        switch (target) {
          case "backlog":
            return "open";
          case "triaged":
            return "open";
          case "in_progress":
            return "in_progress";
          case "review":
            return "in_review";
          case "done":
            return "resolved";
        }
      })();
      await db
        .update(AgentAppIssue)
        .set({ status, updatedAt: now })
        .where(eq(AgentAppIssue.id, id));
    } else if (source === "tech_suggestion" && TechWatchSuggestion) {
      const status =
        target === "done"
          ? "dismissed"
          : target === "in_progress"
            ? "converted_to_request"
            : "open";
      await db
        .update(TechWatchSuggestion)
        .set({ status, updatedAt: now })
        .where(eq(TechWatchSuggestion.id, id));
    } else {
      return { ok: false, error: "source inconnue" };
    }

    await insertForgeActivityLog({
      actorType: "user",
      actorId: "mission_board",
      action: "mission.move",
      entityType: source,
      entityId: String(id),
      details: { target },
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Marque une suggestion comme ignorée. */
export async function dismissMissionItem(
  uid: string,
): Promise<{ ok: boolean; error?: string }> {
  return moveMissionItem(uid, "done");
}

/**
 * Promeut jusqu'à `maxPromote` items en colonne `triaged` vers `in_progress`
 * en créant un `AgentTask` si nécessaire. Appelé par le scheduler.
 */
export async function pullMissionBoardOnce(
  maxPromote = 5,
): Promise<{ ok: boolean; promoted: number; error?: string }> {
  try {
    const overview = await getMissionBoardOverview();
    const candidates = overview.items.filter((it) => it.column === "triaged");
    if (candidates.length === 0) return { ok: true, promoted: 0 };

    const { db, AgentTask, Request, AgentAppIssue } = await loadAstroDb();
    let promoted = 0;
    const now = new Date();

    for (const item of candidates.slice(0, maxPromote)) {
      const agentId =
        item.assignee ||
        (item.swimlane === "bugs"
          ? "EXPERT_DEBUG"
          : item.swimlane === "tech"
            ? "VEILLE_TECH"
            : "CHEF_TECHNIQUE");

      const taskTitle =
        item.source === "app_issue"
          ? `[BugFlow] AppIssue #${item.sourceId} — ${item.title}`
          : item.source === "tech_suggestion"
            ? `[Veille] Suggestion #${item.sourceId} — ${item.title}`
            : `[Carnet] Request #${item.sourceId} — ${item.title}`;

      await db.insert(AgentTask).values({
        agentId,
        task: taskTitle.slice(0, 240),
        input: item.summary
          ? `${item.summary}\n\nSource: ${item.uid}`
          : `Source: ${item.uid}`,
        status: "pending",
        createdAt: now,
        updatedAt: now,
      });

      if (item.source === "request") {
        await db
          .update(Request)
          .set({ status: "in_progress", updatedAt: now })
          .where(eq(Request.id, item.sourceId));
      } else if (item.source === "app_issue") {
        await db
          .update(AgentAppIssue)
          .set({ status: "in_progress", updatedAt: now })
          .where(eq(AgentAppIssue.id, item.sourceId));
      }
      promoted++;
    }

    await insertForgeActivityLog({
      actorType: "system",
      actorId: "scheduler",
      action: "mission.pull",
      entityType: "mission_board",
      entityId: "pull",
      details: { promoted },
    });

    return { ok: true, promoted };
  } catch (e) {
    return {
      ok: false,
      promoted: 0,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
