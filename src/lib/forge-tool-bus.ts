import { eq } from 'drizzle-orm';
import { getZimaOSInfraClient } from './forge-infra-client';
import { loadAstroDb } from './load-astro-db';
import { resolveProjectPathFromDbProject } from './forge-repos';
import { getConfig } from './config-db';
import type { EffectiveTool } from './forge-tool-catalog';
import {
  applyForgeAttributionGitCommitMessage,
  applyForgeAttributionPrBody,
  applyForgeAttributionPrTitle,
} from './forge-agent-attribution';

export type ForgeToolCall =
  | { tool: 'read_file'; path: string }
  | { tool: 'write_file'; path: string; content: string }
  | { tool: 'exec'; command: string }
  | { tool: 'update_request_status'; requestId: number; status: 'pending' | 'in_progress' | 'completed' | 'rejected' }
  | { tool: 'restart_gateway'; containerName?: string };

export type ForgeToolResult = {
  ok: boolean;
  tool: string;
  output?: string;
  error?: string;
  beforeContent?: string | null;
  afterContent?: string | null;
  diff?: string;
  addedLines?: number;
  deletedLines?: number;
  durationMs?: number;
  exitCode?: number;
};

/** Contexte d'exécution disponible pour les outils dynamiques. */
export type ToolExecutionContext = {
  agentId: string;
  projectId?: number;
  /** Permet d'écraser le projectPath (par ex. pour tests). */
  overrideProjectPath?: string;
};

function buildUnifiedDiff(path: string, beforeContent: string | null, afterContent: string | null): string {
  const before = beforeContent ?? '';
  const after = afterContent ?? '';
  if (before === after) return '';
  const beforeLines = before.split(/\r?\n/);
  const afterLines = after.split(/\r?\n/);
  const rows = [`--- ${path}`, `+++ ${path}`];
  const max = Math.max(beforeLines.length, afterLines.length);
  for (let i = 0; i < max; i++) {
    const oldLine = beforeLines[i];
    const newLine = afterLines[i];
    if (oldLine === newLine) {
      if (oldLine !== undefined) rows.push(` ${oldLine}`);
      continue;
    }
    if (oldLine !== undefined) rows.push(`-${oldLine}`);
    if (newLine !== undefined) rows.push(`+${newLine}`);
  }
  return rows.join('\n');
}

function countDiffStats(diff: string): { addedLines: number; deletedLines: number } {
  let addedLines = 0;
  let deletedLines = 0;
  for (const line of diff.split('\n')) {
    if (line.startsWith('+++') || line.startsWith('---')) continue;
    if (line.startsWith('+')) addedLines++;
    if (line.startsWith('-')) deletedLines++;
  }
  return { addedLines, deletedLines };
}

/**
 * Templating Handlebars-like minimal :
 *  - {{name}}        → variable obligatoire (vide si absente)
 *  - {{name|default}} → fallback simple ou récursif {{a|{{b}}}}
 *  - {{?flagName|valueIfTrue}} → conditionnel sur un boolean
 */
export function renderTemplate(template: string, vars: Record<string, unknown>): string {
  let prev = '';
  let curr = template;
  // Iteratif pour gérer les défauts récursifs {{a|{{b|c}}}}
  let iterations = 0;
  while (curr !== prev && iterations < 6) {
    prev = curr;
    curr = curr.replace(/\{\{(\??)([\w]+)(?:\|([^{}]*))?\}\}/g, (_, isFlag: string, name: string, fallback?: string) => {
      if (isFlag === '?') {
        return vars[name] ? (fallback ?? '') : '';
      }
      const v = vars[name];
      if (v === undefined || v === null || v === '') return fallback ?? '';
      return String(v);
    });
    iterations++;
  }
  return curr;
}

async function buildContextVars(ctx: ToolExecutionContext): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  if (ctx.overrideProjectPath) {
    out.__projectPath = ctx.overrideProjectPath;
  } else if (typeof ctx.projectId === 'number') {
    try {
      const { db, Project } = await loadAstroDb();
      const rows = await db.select().from(Project).where(eq(Project.id, ctx.projectId));
      if (rows[0]) {
        const projectPath = await resolveProjectPathFromDbProject(rows[0]);
        if (projectPath) out.__projectPath = projectPath;
        out.__projectName = rows[0].name;
        out.__branch = String(rows[0].githubBranchDev || 'dev');
      }
    } catch {
      /* ignore */
    }
  }
  try {
    const token = (await getConfig('githubToken')).trim();
    if (token) out.__githubToken = token;
  } catch {
    /* ignore */
  }
  return out;
}

// ───────────────────────────────────────────────────────────────────────────
// Handlers builtin
// ───────────────────────────────────────────────────────────────────────────

async function runBuiltinReadFile(args: Record<string, unknown>): Promise<ForgeToolResult> {
  const path = String(args.path || '').trim();
  if (!path) return { ok: false, tool: 'read_file', error: 'path requis' };
  const infra = await getZimaOSInfraClient();
  try {
    return { ok: true, tool: 'read_file', output: infra.readFile(path) };
  } catch (e) {
    return { ok: false, tool: 'read_file', error: e instanceof Error ? e.message : String(e) };
  }
}

async function runBuiltinWriteFile(args: Record<string, unknown>): Promise<ForgeToolResult> {
  const path = String(args.path || '').trim();
  const content = typeof args.content === 'string' ? args.content : String(args.content ?? '');
  if (!path) return { ok: false, tool: 'write_file', error: 'path requis' };
  const infra = await getZimaOSInfraClient();
  try {
    const beforeContent = infra.exists(path) ? infra.readFile(path) : null;
    infra.writeFile(path, content);
    const afterContent = infra.readFile(path);
    const diff = buildUnifiedDiff(path, beforeContent, afterContent);
    const stats = countDiffStats(diff);
    return { ok: true, tool: 'write_file', output: 'ok', beforeContent, afterContent, diff, ...stats };
  } catch (e) {
    return { ok: false, tool: 'write_file', error: e instanceof Error ? e.message : String(e) };
  }
}

async function runBuiltinExec(args: Record<string, unknown>): Promise<ForgeToolResult> {
  const command = String(args.command || '').trim();
  if (!command) return { ok: false, tool: 'exec', error: 'command requis' };
  const infra = await getZimaOSInfraClient();
  const startedAt = Date.now();
  try {
    const out = infra.exec(command);
    return { ok: true, tool: 'exec', output: out, durationMs: Date.now() - startedAt, exitCode: 0 };
  } catch (e) {
    return {
      ok: false,
      tool: 'exec',
      error: e instanceof Error ? e.message : String(e),
      durationMs: Date.now() - startedAt,
    };
  }
}

async function runBuiltinUpdateRequestStatus(args: Record<string, unknown>): Promise<ForgeToolResult> {
  const requestId = Number(args.requestId);
  const status = String(args.status || '').trim();
  const allowed = ['pending', 'in_progress', 'completed', 'rejected'];
  if (!Number.isFinite(requestId) || !allowed.includes(status)) {
    return { ok: false, tool: 'update_request_status', error: 'requestId ou status invalide' };
  }
  try {
    const { db, Request } = await loadAstroDb();
    await db.update(Request).set({ status, updatedAt: new Date() }).where(eq(Request.id, requestId));
    return { ok: true, tool: 'update_request_status', output: `Demande #${requestId} → ${status}` };
  } catch (e) {
    return { ok: false, tool: 'update_request_status', error: e instanceof Error ? e.message : String(e) };
  }
}

async function runBuiltinRestartGateway(args: Record<string, unknown>): Promise<ForgeToolResult> {
  const containerName = typeof args.containerName === 'string' ? args.containerName.trim() : '';
  const infra = await getZimaOSInfraClient();
  try {
    const out = containerName ? infra.exec(`docker restart ${containerName}`) : infra.restartContainer();
    return { ok: true, tool: 'restart_gateway', output: out };
  } catch (e) {
    return { ok: false, tool: 'restart_gateway', error: e instanceof Error ? e.message : String(e) };
  }
}

/** Guillemet shell POSIX-safe pour une chaîne utilisée après `git commit -m`. */
function shellEscapeForSingleQuotedSegments(s: string): string {
  return `'${String(s).replace(/'/g, `'\\''`)}'`;
}

/**
 * git commit avec message forcément préfixé `[Ageton · AGENT]` côté serveur.
 */
async function runBuiltinGitCommit(
  args: Record<string, unknown>,
  ctx: ToolExecutionContext,
): Promise<ForgeToolResult> {
  const amend = Boolean(args.amend);
  const userMsg = String(args.message ?? '').trim();
  if (!userMsg) {
    return { ok: false, tool: 'git_commit', error: 'message requis (sujet de commit).' };
  }

  let cwd = String(ctx.overrideProjectPath || '').trim();
  const ctxVars = await buildContextVars(ctx);
  if (!cwd) cwd = String(ctxVars.__projectPath || '').trim();
  if (!cwd) {
    return {
      ok: false,
      tool: 'git_commit',
      error: 'Aucun chemin projet (projectId hors scope ou projet introuvable).',
    };
  }

  const message = applyForgeAttributionGitCommitMessage(ctx.agentId, userMsg);
  const infra = await getZimaOSInfraClient();
  const startedAt = Date.now();
  try {
    const cd = shellEscapeForSingleQuotedSegments(cwd);
    const quotedMsg = shellEscapeForSingleQuotedSegments(message);
    const cmd = amend
      ? `cd ${cd} && git commit --amend -m ${quotedMsg}`
      : `cd ${cd} && git commit -m ${quotedMsg}`;
    const out = infra.exec(cmd);
    return {
      ok: true,
      tool: 'git_commit',
      output: out?.trim().length ? out : 'Commit enregistré.',
      durationMs: Date.now() - startedAt,
      exitCode: 0,
    };
  } catch (e) {
    return {
      ok: false,
      tool: 'git_commit',
      error: e instanceof Error ? e.message : String(e),
      durationMs: Date.now() - startedAt,
    };
  }
}

/**
 * Auto-installation : crée un AgentTool + AgentToolAssignment pour l'agent demandeur.
 * Aucun Approval requis (choix utilisateur — sécurité = no_approval).
 */
async function runBuiltinRequestTool(
  args: Record<string, unknown>,
  ctx: ToolExecutionContext,
): Promise<ForgeToolResult> {
  const name = String(args.name || '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
  const displayName = String(args.displayName || name).trim();
  const description = String(args.description || `Outil installé par ${ctx.agentId}`).trim();
  const commandTemplate = String(args.commandTemplate || '').trim();
  const category = String(args.category || 'custom').trim();
  if (!name || !commandTemplate) {
    return { ok: false, tool: 'request_tool', error: 'name et commandTemplate requis' };
  }
  let parameters: Record<string, unknown> = { type: 'object', properties: {} };
  if (typeof args.parameters === 'string' && args.parameters.trim()) {
    try {
      parameters = JSON.parse(args.parameters);
    } catch {
      return { ok: false, tool: 'request_tool', error: 'parameters doit être un JSON Schema valide' };
    }
  } else if (args.parameters && typeof args.parameters === 'object') {
    parameters = args.parameters as Record<string, unknown>;
  }

  try {
    const { db, AgentTool, AgentToolAssignment } = await loadAstroDb();
    const now = new Date();
    const existing = await db.select().from(AgentTool).where(eq(AgentTool.name, name));
    let toolId: number;
    if (existing.length > 0) {
      toolId = existing[0].id;
    } else {
      const inserted = await db
        .insert(AgentTool)
        .values({
          name,
          displayName,
          description,
          category,
          parametersJson: JSON.stringify(parameters),
          implementationKind: 'exec_template',
          implementationConfig: JSON.stringify({ command: commandTemplate, timeoutMs: 30000 }),
          enabled: 1,
          builtin: 0,
          requiresApproval: 0,
          createdByAgentId: ctx.agentId,
          createdAt: now,
          updatedAt: now,
        })
        .returning({ id: AgentTool.id });
      toolId = inserted[0]!.id;
    }
    // Assignation à l'agent demandeur
    const existingAssign = await db
      .select()
      .from(AgentToolAssignment)
      .where(eq(AgentToolAssignment.agentId, ctx.agentId));
    const alreadyAssigned = existingAssign.some((a) => a.toolId === toolId);
    if (!alreadyAssigned) {
      await db.insert(AgentToolAssignment).values({
        agentId: ctx.agentId,
        toolId,
        enabled: 1,
        source: 'self_installed',
        createdAt: now,
      });
    }
    return {
      ok: true,
      tool: 'request_tool',
      output: `Outil "${name}" installé et assigné. Tu peux l'appeler immédiatement.`,
    };
  } catch (e) {
    return { ok: false, tool: 'request_tool', error: e instanceof Error ? e.message : String(e) };
  }
}

const BUILTIN_HANDLERS: Record<
  string,
  (args: Record<string, unknown>, ctx: ToolExecutionContext) => Promise<ForgeToolResult>
> = {
  read_file: (args) => runBuiltinReadFile(args),
  write_file: (args) => runBuiltinWriteFile(args),
  exec: (args) => runBuiltinExec(args),
  update_request_status: (args) => runBuiltinUpdateRequestStatus(args),
  restart_gateway: (args) => runBuiltinRestartGateway(args),
  git_commit: (args, ctx) => runBuiltinGitCommit(args, ctx),
  request_tool: (args, ctx) => runBuiltinRequestTool(args, ctx),
};

// ───────────────────────────────────────────────────────────────────────────
// Dispatch principal — outil dynamique (lu depuis DB)
// ───────────────────────────────────────────────────────────────────────────

export async function executeDynamicTool(
  tool: EffectiveTool,
  args: Record<string, unknown>,
  ctx: ToolExecutionContext,
): Promise<ForgeToolResult> {
  if (tool.implementationKind === 'builtin') {
    const handlerName = String((tool.implementationConfig.handler as string) || tool.name);
    const handler = BUILTIN_HANDLERS[handlerName];
    if (!handler) {
      return { ok: false, tool: tool.name, error: `Handler builtin "${handlerName}" inconnu.` };
    }
    return handler(args, ctx);
  }

  if (tool.implementationKind === 'exec_template') {
    const cfg = tool.implementationConfig;
    const template = String(cfg.command || '');
    if (!template) {
      return { ok: false, tool: tool.name, error: 'Aucun template de commande défini.' };
    }
    const ctxVars = await buildContextVars(ctx);

    let resolvedArgs = args as Record<string, unknown>;
    if (tool.name === 'gh_pr_create') {
      resolvedArgs = { ...resolvedArgs };
      resolvedArgs.title = applyForgeAttributionPrTitle(
        ctx.agentId,
        String(resolvedArgs.title ?? ''),
      );
      resolvedArgs.body = applyForgeAttributionPrBody(
        ctx.agentId,
        String(resolvedArgs.body ?? ''),
      );
    }

    const allVars: Record<string, unknown> = { ...ctxVars, ...resolvedArgs };
    const command = renderTemplate(template, allVars).trim();
    if (!command) {
      return { ok: false, tool: tool.name, error: 'Template rendu vide (variables manquantes ?).' };
    }
    const infra = await getZimaOSInfraClient();
    const startedAt = Date.now();
    try {
      const out = infra.exec(command);
      return { ok: true, tool: tool.name, output: out, durationMs: Date.now() - startedAt, exitCode: 0 };
    } catch (e) {
      return {
        ok: false,
        tool: tool.name,
        error: e instanceof Error ? e.message : String(e),
        durationMs: Date.now() - startedAt,
      };
    }
  }

  if (tool.implementationKind === 'http') {
    const cfg = tool.implementationConfig;
    const ctxVars = await buildContextVars(ctx);
    const allVars: Record<string, unknown> = { ...ctxVars, ...args };
    const url = renderTemplate(String(cfg.url || ''), allVars);
    // `method` est souvent un template en DB (ex: `{{method|GET}}`) — il faut le rendre comme `url` / `body`.
    const method = (renderTemplate(String(cfg.method || 'GET'), allVars).trim() || 'GET').toUpperCase();
    const bodyTpl = cfg.body != null ? String(cfg.body) : '';
    const body = bodyTpl ? renderTemplate(bodyTpl, allVars) : undefined;
    if (!url) return { ok: false, tool: tool.name, error: 'URL HTTP manquante.' };
    const startedAt = Date.now();
    try {
      const res = await fetch(url, { method, body, headers: { 'Content-Type': 'application/json' } });
      const text = await res.text();
      return {
        ok: res.ok,
        tool: tool.name,
        output: text,
        exitCode: res.status,
        durationMs: Date.now() - startedAt,
        error: res.ok ? undefined : `HTTP ${res.status}`,
      };
    } catch (e) {
      return {
        ok: false,
        tool: tool.name,
        error: e instanceof Error ? e.message : String(e),
        durationMs: Date.now() - startedAt,
      };
    }
  }

  return { ok: false, tool: tool.name, error: `implementationKind inconnu: ${tool.implementationKind}` };
}

/**
 * API legacy conservée : ancien chemin via le type figé ForgeToolCall.
 * Utilisé uniquement par le fallback texte [FORGE_TOOL_EXEC] de l'orchestrateur
 * pour rester rétro-compatible avec les modèles non tool-aware.
 */
export async function runForgeTool(
  call: ForgeToolCall,
  ctx?: ToolExecutionContext,
): Promise<ForgeToolResult> {
  const context: ToolExecutionContext = ctx || { agentId: 'unknown' };
  if (call.tool === 'read_file') return runBuiltinReadFile({ path: call.path });
  if (call.tool === 'write_file') return runBuiltinWriteFile({ path: call.path, content: call.content });
  if (call.tool === 'exec') return runBuiltinExec({ command: call.command });
  if (call.tool === 'update_request_status')
    return runBuiltinUpdateRequestStatus({ requestId: call.requestId, status: call.status });
  if (call.tool === 'restart_gateway')
    return runBuiltinRestartGateway({ containerName: call.containerName });
  return { ok: false, tool: (call as { tool: string }).tool, error: 'Outil legacy inconnu' };
}
