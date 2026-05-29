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
import {
  decidePermission,
  recordPermissionDecision,
  type PermissionDecisionContext,
} from './forge-permission-engine';
import { installToolPackage, type InstallManager } from './forge-tool-install';
import {
  dockerContainerCreate,
  dockerContainerStart,
  dockerContainerStop,
  dockerContainerRestart,
  dockerContainerRemove,
  dockerContainerExec,
  dockerContainerLogsTail,
  dockerImagePull,
  dockerImageBuild,
  dockerImageList,
  dockerComposeUp,
  dockerComposeDown,
  dockerVolumeList,
  dockerVolumeRemove,
  dockerNetworkList,
  dockerInfo,
} from './forge-docker-ops';
import {
  ghListPullRequests,
  ghGetPullRequest,
  ghMergePullRequest,
  ghClosePullRequest,
  ghCommentOnIssueOrPr,
  ghReviewPullRequest,
  ghListIssues,
  ghCreateIssue,
  ghCloseIssue,
  ghAddLabels,
  ghListWorkflowRuns,
  ghCancelWorkflowRun,
  ghRerunWorkflowRun,
  ghDependabotAlerts,
  ghCodeScanningAlerts,
  ghListBranches,
  ghCreateRelease,
  ghApiGeneric,
} from './forge-github-api';

export type ForgeToolCall =
  | { tool: 'read_file'; path: string }
  | { tool: 'write_file'; path: string; content: string }
  | { tool: 'exec'; command: string }
  | { tool: 'create_module'; identifier: string; name: string; description?: string; payload?: string; isMcp?: boolean | number; mcpUrl?: string }
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

async function runBuiltinCreateModule(args: Record<string, unknown>): Promise<ForgeToolResult> {
  const identifier = String(args.identifier || '').trim();
  const name = String(args.name || '').trim();
  const description = String(args.description || '').trim();
  const payload = String(args.payload || '{}').trim();
  const isMcp = args.isMcp === true || args.isMcp === 1 ? 1 : 0;
  const mcpUrl = typeof args.mcpUrl === 'string' ? args.mcpUrl.trim() : null;

  if (!identifier || !name) {
    return { ok: false, tool: 'create_module', error: 'identifier et name sont requis' };
  }

  try {
    const { db, ForgeModule, AgentTool } = await loadAstroDb();
    const now = new Date();

    // Insert the module
    await db.insert(ForgeModule).values({
      identifier,
      name,
      description,
      version: '1.0.0',
      payload,
      installed: 0,
      published: 0,
      isMcp,
      mcpUrl,
      createdAt: now,
      updatedAt: now,
    });

    let toolsRegistered = 0;
    // Attempt to parse payload and register any bundled tools
    try {
      const parsed = JSON.parse(payload);
      if (parsed && Array.isArray(parsed.tools)) {
        for (const t of parsed.tools) {
          if (!t.name || !t.implementationConfig) continue;

          const existing = await db.select().from(AgentTool).where(eq(AgentTool.name, t.name));
          if (existing.length === 0) {
            await db.insert(AgentTool).values({
              name: t.name,
              displayName: t.displayName || t.name,
              description: t.description || `Outil bundled dans ${identifier}`,
              category: identifier.replace('module-', ''),
              parametersJson: t.parametersJson || JSON.stringify(t.parameters || { type: 'object', properties: {} }),
              implementationKind: t.implementationKind || 'exec_template',
              implementationConfig: typeof t.implementationConfig === 'string' ? t.implementationConfig : JSON.stringify(t.implementationConfig),
              enabled: 1,
              builtin: 0,
              requiresApproval: t.requiresApproval ? 1 : 0,
              createdAt: now,
              updatedAt: now,
            });
            toolsRegistered++;
          }
        }
      }
    } catch {
      // Ignore JSON parse error or missing tools array
    }

    return {
      ok: true,
      tool: 'create_module',
      output: `Module ${identifier} créé avec succès.` + (toolsRegistered > 0 ? ` ${toolsRegistered} outil(s) enregistré(s).` : '')
    };
  } catch (e) {
    return { ok: false, tool: 'create_module', error: e instanceof Error ? e.message : String(e) };
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

// ───────────────────────────────────────────────────────────────────────────
// Handlers Phase 3 — install + fs + docker + github
// ───────────────────────────────────────────────────────────────────────────

async function runBuiltinInstallTool(args: Record<string, unknown>): Promise<ForgeToolResult> {
  const pkg = String(args.pkg || args.name || '').trim();
  const manager = (String(args.manager || 'auto') as InstallManager);
  if (!pkg) return { ok: false, tool: 'install_tool', error: 'pkg requis' };
  const res = await installToolPackage({ pkg, manager });
  return {
    ok: res.ok,
    tool: 'install_tool',
    output: res.output || `${res.manager} install "${pkg}"`,
    error: res.error,
  };
}

async function runBuiltinFsMkdir(args: Record<string, unknown>): Promise<ForgeToolResult> {
  const p = String(args.path || '').trim();
  if (!p) return { ok: false, tool: 'fs_mkdir', error: 'path requis' };
  const recursive = args.recursive !== false;
  const infra = await getZimaOSInfraClient();
  try {
    infra.exec(`mkdir ${recursive ? '-p' : ''} -- "${p.replace(/"/g, '\\"')}"`);
    return { ok: true, tool: 'fs_mkdir', output: 'ok' };
  } catch (e) {
    return { ok: false, tool: 'fs_mkdir', error: e instanceof Error ? e.message : String(e) };
  }
}

async function runBuiltinFsDelete(args: Record<string, unknown>): Promise<ForgeToolResult> {
  const p = String(args.path || '').trim();
  if (!p) return { ok: false, tool: 'fs_delete', error: 'path requis' };
  const recursive = Boolean(args.recursive);
  const infra = await getZimaOSInfraClient();
  try {
    infra.exec(`rm ${recursive ? '-rf' : '-f'} -- "${p.replace(/"/g, '\\"')}"`);
    return { ok: true, tool: 'fs_delete', output: 'ok' };
  } catch (e) {
    return { ok: false, tool: 'fs_delete', error: e instanceof Error ? e.message : String(e) };
  }
}

async function runBuiltinFsChmod(args: Record<string, unknown>): Promise<ForgeToolResult> {
  const p = String(args.path || '').trim();
  const mode = String(args.mode || '').trim();
  if (!p || !/^[0-7]{3,4}$/.test(mode)) {
    return { ok: false, tool: 'fs_chmod', error: 'path et mode octal (ex: 644 ou 0755) requis' };
  }
  const infra = await getZimaOSInfraClient();
  try {
    infra.exec(`chmod ${mode} -- "${p.replace(/"/g, '\\"')}"`);
    return { ok: true, tool: 'fs_chmod', output: 'ok' };
  } catch (e) {
    return { ok: false, tool: 'fs_chmod', error: e instanceof Error ? e.message : String(e) };
  }
}

async function runBuiltinFsSearch(args: Record<string, unknown>): Promise<ForgeToolResult> {
  const pattern = String(args.pattern || '').trim();
  const path = String(args.path || '.').trim();
  if (!pattern) return { ok: false, tool: 'fs_search', error: 'pattern requis' };
  const mode = String(args.mode || 'content').toLowerCase();
  const infra = await getZimaOSInfraClient();
  const cmd =
    mode === 'name'
      ? `cd "${path.replace(/"/g, '\\"')}" && find . -name "${pattern.replace(/"/g, '\\"')}" -not -path "*/node_modules/*" -not -path "*/.git/*" | head -200`
      : `cd "${path.replace(/"/g, '\\"')}" && (command -v rg >/dev/null && rg --no-heading -n -S "${pattern.replace(/"/g, '\\"')}" -g '!node_modules' -g '!.git' | head -200) || (grep -rIn --exclude-dir=node_modules --exclude-dir=.git "${pattern.replace(/"/g, '\\"')}" . | head -200)`;
  try {
    const out = infra.exec(cmd);
    return { ok: true, tool: 'fs_search', output: out };
  } catch (e) {
    return { ok: false, tool: 'fs_search', error: e instanceof Error ? e.message : String(e) };
  }
}

function dockerHandler<T>(toolName: string, run: () => Promise<{ ok: boolean; output?: string; error?: string }>): Promise<ForgeToolResult> {
  return run().then((r) => ({
    ok: r.ok,
    tool: toolName,
    output: r.output,
    error: r.error,
  }));
}

function ghHandlerFromArgs(
  toolName: string,
  run: () => Promise<{ ok: boolean; status: number; data?: unknown; error?: string }>,
): Promise<ForgeToolResult> {
  return run().then((r) => ({
    ok: r.ok,
    tool: toolName,
    output: r.data ? JSON.stringify(r.data, null, 2) : undefined,
    error: r.error,
    exitCode: r.status,
  }));
}

function ownerRepo(args: Record<string, unknown>): { owner: string; repo: string } {
  const owner = String(args.owner || '').trim();
  const repo = String(args.repo || '').trim();
  if (!owner || !repo) {
    throw new Error('owner et repo requis');
  }
  return { owner, repo };
}

async function safeOwnerRepo(toolName: string, args: Record<string, unknown>, fn: (or: { owner: string; repo: string }) => Promise<ForgeToolResult>): Promise<ForgeToolResult> {
  try {
    return await fn(ownerRepo(args));
  } catch (e) {
    return { ok: false, tool: toolName, error: e instanceof Error ? e.message : String(e) };
  }
}

const BUILTIN_HANDLERS: Record<
  string,
  (args: Record<string, unknown>, ctx: ToolExecutionContext) => Promise<ForgeToolResult>
> = {
  // Phase 1 / déjà existants
  read_file: (args) => runBuiltinReadFile(args),
  write_file: (args) => runBuiltinWriteFile(args),
  exec: (args) => runBuiltinExec(args),
  create_module: (args) => runBuiltinCreateModule(args),
  update_request_status: (args) => runBuiltinUpdateRequestStatus(args),
  restart_gateway: (args) => runBuiltinRestartGateway(args),
  git_commit: (args, ctx) => runBuiltinGitCommit(args, ctx),
  request_tool: (args, ctx) => runBuiltinRequestTool(args, ctx),

  // Phase 3 — install + fs étendus
  install_tool: (args) => runBuiltinInstallTool(args),
  fs_mkdir: (args) => runBuiltinFsMkdir(args),
  fs_delete: (args) => runBuiltinFsDelete(args),
  fs_chmod: (args) => runBuiltinFsChmod(args),
  fs_search: (args) => runBuiltinFsSearch(args),

  // Phase 3 — docker complet
  docker_container_create: (args) => dockerHandler('docker_container_create', () =>
    dockerContainerCreate({
      image: String(args.image || ''),
      name: args.name ? String(args.name) : undefined,
      env: (args.env as Record<string, string> | undefined) ?? undefined,
      ports: Array.isArray(args.ports) ? args.ports.map(String) : undefined,
      volumes: Array.isArray(args.volumes) ? args.volumes.map(String) : undefined,
      cmd: args.cmd ? String(args.cmd) : undefined,
      detach: args.detach === false ? false : true,
    })),
  docker_container_start: (args) => dockerHandler('docker_container_start', () => dockerContainerStart(String(args.name || ''))),
  docker_container_stop: (args) => dockerHandler('docker_container_stop', () => dockerContainerStop(String(args.name || ''), Number(args.timeoutSec ?? 10))),
  docker_container_restart: (args) => dockerHandler('docker_container_restart', () => dockerContainerRestart(String(args.name || ''))),
  docker_container_remove: (args) => dockerHandler('docker_container_remove', () => dockerContainerRemove(String(args.name || ''), Boolean(args.force))),
  docker_container_exec: (args) => dockerHandler('docker_container_exec', () => dockerContainerExec(String(args.name || ''), String(args.command || ''))),
  docker_container_logs_tail: (args) => dockerHandler('docker_container_logs_tail', () => dockerContainerLogsTail(String(args.name || ''), Number(args.lines ?? 100))),
  docker_image_pull: (args) => dockerHandler('docker_image_pull', () => dockerImagePull(String(args.image || ''))),
  docker_image_build: (args) => dockerHandler('docker_image_build', () => dockerImageBuild({
    contextPath: String(args.contextPath || '.'),
    tag: String(args.tag || ''),
    dockerfile: args.dockerfile ? String(args.dockerfile) : undefined,
  })),
  docker_image_list: () => dockerHandler('docker_image_list', () => dockerImageList()),
  docker_compose_up: (args) => dockerHandler('docker_compose_up', () => dockerComposeUp(String(args.composeFile || ''), args.detach !== false)),
  docker_compose_down: (args) => dockerHandler('docker_compose_down', () => dockerComposeDown(String(args.composeFile || ''))),
  docker_volume_list: () => dockerHandler('docker_volume_list', () => dockerVolumeList()),
  docker_volume_remove: (args) => dockerHandler('docker_volume_remove', () => dockerVolumeRemove(String(args.name || ''))),
  docker_network_list: () => dockerHandler('docker_network_list', () => dockerNetworkList()),
  docker_info: () => dockerHandler('docker_info', () => dockerInfo()),

  // Phase 3 — GitHub API natif
  gh_api: (args) => ghHandlerFromArgs('gh_api', () => ghApiGeneric(String(args.endpoint || ''), (String(args.method || 'GET').toUpperCase() as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'), args.body)),
  gh_pr_list_api: (args) => safeOwnerRepo('gh_pr_list_api', args, (or) => ghHandlerFromArgs('gh_pr_list_api', () => ghListPullRequests(or.owner, or.repo, (String(args.state || 'open') as 'open' | 'closed' | 'all')))),
  gh_pr_get: (args) => safeOwnerRepo('gh_pr_get', args, (or) => ghHandlerFromArgs('gh_pr_get', () => ghGetPullRequest(or.owner, or.repo, Number(args.number)))),
  gh_pr_merge: (args) => safeOwnerRepo('gh_pr_merge', args, (or) => ghHandlerFromArgs('gh_pr_merge', () => ghMergePullRequest(or.owner, or.repo, Number(args.number), {
    commit_title: args.commit_title ? String(args.commit_title) : undefined,
    commit_message: args.commit_message ? String(args.commit_message) : undefined,
    merge_method: args.merge_method ? (String(args.merge_method) as 'merge' | 'squash' | 'rebase') : undefined,
  }))),
  gh_pr_close: (args) => safeOwnerRepo('gh_pr_close', args, (or) => ghHandlerFromArgs('gh_pr_close', () => ghClosePullRequest(or.owner, or.repo, Number(args.number)))),
  gh_pr_review: (args) => safeOwnerRepo('gh_pr_review', args, (or) => ghHandlerFromArgs('gh_pr_review', () => ghReviewPullRequest(or.owner, or.repo, Number(args.number), {
    event: (String(args.event || 'COMMENT') as 'COMMENT' | 'APPROVE' | 'REQUEST_CHANGES'),
    body: args.body ? String(args.body) : undefined,
  }))),
  gh_pr_comment: (args) => safeOwnerRepo('gh_pr_comment', args, (or) => ghHandlerFromArgs('gh_pr_comment', () => ghCommentOnIssueOrPr(or.owner, or.repo, Number(args.number), String(args.body || '')))),
  gh_issue_list: (args) => safeOwnerRepo('gh_issue_list', args, (or) => ghHandlerFromArgs('gh_issue_list', () => ghListIssues(or.owner, or.repo, (String(args.state || 'open') as 'open' | 'closed' | 'all')))),
  gh_issue_create: (args) => safeOwnerRepo('gh_issue_create', args, (or) => ghHandlerFromArgs('gh_issue_create', () => ghCreateIssue(or.owner, or.repo, {
    title: String(args.title || ''),
    body: args.body ? String(args.body) : undefined,
    labels: Array.isArray(args.labels) ? args.labels.map(String) : undefined,
    assignees: Array.isArray(args.assignees) ? args.assignees.map(String) : undefined,
  }))),
  gh_issue_close: (args) => safeOwnerRepo('gh_issue_close', args, (or) => ghHandlerFromArgs('gh_issue_close', () => ghCloseIssue(or.owner, or.repo, Number(args.number)))),
  gh_issue_comment: (args) => safeOwnerRepo('gh_issue_comment', args, (or) => ghHandlerFromArgs('gh_issue_comment', () => ghCommentOnIssueOrPr(or.owner, or.repo, Number(args.number), String(args.body || '')))),
  gh_issue_label: (args) => safeOwnerRepo('gh_issue_label', args, (or) => ghHandlerFromArgs('gh_issue_label', () => ghAddLabels(or.owner, or.repo, Number(args.number), Array.isArray(args.labels) ? args.labels.map(String) : []))),
  gh_workflow_runs: (args) => safeOwnerRepo('gh_workflow_runs', args, (or) => ghHandlerFromArgs('gh_workflow_runs', () => ghListWorkflowRuns(or.owner, or.repo, {
    status: args.status ? String(args.status) : undefined,
    branch: args.branch ? String(args.branch) : undefined,
  }))),
  gh_workflow_cancel: (args) => safeOwnerRepo('gh_workflow_cancel', args, (or) => ghHandlerFromArgs('gh_workflow_cancel', () => ghCancelWorkflowRun(or.owner, or.repo, Number(args.runId)))),
  gh_workflow_rerun: (args) => safeOwnerRepo('gh_workflow_rerun', args, (or) => ghHandlerFromArgs('gh_workflow_rerun', () => ghRerunWorkflowRun(or.owner, or.repo, Number(args.runId)))),
  gh_dependabot_alerts: (args) => safeOwnerRepo('gh_dependabot_alerts', args, (or) => ghHandlerFromArgs('gh_dependabot_alerts', () => ghDependabotAlerts(or.owner, or.repo, (String(args.state || 'open') as 'open' | 'dismissed' | 'fixed' | 'auto_dismissed')))),
  gh_security_advisories: (args) => safeOwnerRepo('gh_security_advisories', args, (or) => ghHandlerFromArgs('gh_security_advisories', () => ghCodeScanningAlerts(or.owner, or.repo, (String(args.state || 'open') as 'open' | 'closed' | 'dismissed' | 'fixed')))),
  gh_branches_list: (args) => safeOwnerRepo('gh_branches_list', args, (or) => ghHandlerFromArgs('gh_branches_list', () => ghListBranches(or.owner, or.repo))),
  gh_release_create: (args) => safeOwnerRepo('gh_release_create', args, (or) => ghHandlerFromArgs('gh_release_create', () => ghCreateRelease(or.owner, or.repo, {
    tag_name: String(args.tag_name || ''),
    name: args.name ? String(args.name) : undefined,
    body: args.body ? String(args.body) : undefined,
    draft: Boolean(args.draft),
    prerelease: Boolean(args.prerelease),
  }))),
};

// ───────────────────────────────────────────────────────────────────────────
// Dispatch principal — outil dynamique (lu depuis DB)
// ───────────────────────────────────────────────────────────────────────────

/**
 * Heuristique : un outil est-il destructif ? Utilisé par le permission engine
 * quand le tool catalog ne fournit pas l'info explicitement.
 */
function inferIsDestructive(tool: EffectiveTool, args: Record<string, unknown>): boolean {
  const name = String(tool.name || '').toLowerCase();
  if (/^(write|delete|remove|rm|drop|destroy|kill|force_push|reset_hard|restart|reboot)/.test(name)) return true;
  if (/_(write|delete|remove|drop|destroy|kill|force|reset_hard)$/.test(name)) return true;
  if (tool.implementationKind === 'exec_template') {
    const cmd = String((tool.implementationConfig as Record<string, unknown>)?.command || '');
    if (/\b(rm|delete|drop|truncate|force|--force|-f\b)/i.test(cmd)) return true;
  }
  if (typeof args.command === 'string' && /\b(rm|delete|drop|truncate|--force)\b/i.test(args.command)) return true;
  return false;
}

function inferIsReadOnly(tool: EffectiveTool): boolean {
  const name = String(tool.name || '').toLowerCase();
  return /^(read|get|list|show|inspect|status|search|glob|grep|fetch|ls|cat|head|tail)/.test(name);
}

export async function executeDynamicTool(
  tool: EffectiveTool,
  args: Record<string, unknown>,
  ctx: ToolExecutionContext,
): Promise<ForgeToolResult> {
  // Permission gate — priorité à la classification explicite (Phase 2),
  // fallback heuristique sinon (Phase 1).
  const cls = tool.classification;
  const permCtx: PermissionDecisionContext = {
    agentId: ctx.agentId,
    toolName: tool.name,
    args,
    isDestructive: cls?.isDestructive ?? inferIsDestructive(tool, args),
    isReadOnly: cls?.isReadOnly ?? inferIsReadOnly(tool),
  };
  const decision = await decidePermission(permCtx);
  if (decision.decision === 'deny') {
    await recordPermissionDecision(permCtx, decision);
    return {
      ok: false,
      tool: tool.name,
      error: `Permission refusée (${decision.ruleId}) : ${decision.reason}`,
    };
  }
  if (decision.decision === 'ask') {
    await recordPermissionDecision(permCtx, decision);
    // En l'absence d'UI de prompt synchrone côté serveur, on enregistre une
    // demande d'Approval et on refuse l'exécution immédiate.
    try {
      const { db, Approval } = await loadAstroDb();
      await db.insert(Approval).values({
        agentId: ctx.agentId,
        type: 'code_change',
        title: `Outil "${tool.name}" demande approbation`,
        payload: JSON.stringify({ toolName: tool.name, args, ruleId: decision.ruleId, reason: decision.reason }),
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    } catch {
      /* ignore */
    }
    return {
      ok: false,
      tool: tool.name,
      error: `Approbation requise (${decision.ruleId}) : ${decision.reason}. Voir /work pour valider.`,
    };
  }
  // Audit best-effort pour allow non triviaux (override agent, allow global explicite, etc.).
  if (decision.ruleId !== 'mode:autonomous') {
    void recordPermissionDecision(permCtx, decision);
  }

  if (tool.implementationKind === 'builtin') {
    const handlerName = String((tool.implementationConfig.handler as string) || tool.name);
    let handler = BUILTIN_HANDLERS[handlerName];
    if (!handler && (globalThis as any).__forgePluginHandlers) {
      const pluginHandler = (globalThis as any).__forgePluginHandlers[handlerName];
      if (typeof pluginHandler === 'function') {
        handler = async (args: any, ctx: any) => {
          try {
            const res = await pluginHandler(args, ctx);
            return { ok: true, tool: tool.name, output: typeof res === 'string' ? res : JSON.stringify(res) };
          } catch (e: any) {
            return { ok: false, tool: tool.name, error: e.message };
          }
        };
      }
    }
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
  if (call.tool === 'create_module')
    return runBuiltinCreateModule({ identifier: call.identifier, name: call.name, description: call.description, payload: call.payload, isMcp: call.isMcp, mcpUrl: call.mcpUrl });
  if (call.tool === 'update_request_status')
    return runBuiltinUpdateRequestStatus({ requestId: call.requestId, status: call.status });
  if (call.tool === 'restart_gateway')
    return runBuiltinRestartGateway({ containerName: call.containerName });
  return { ok: false, tool: (call as { tool: string }).tool, error: 'Outil legacy inconnu' };
}
