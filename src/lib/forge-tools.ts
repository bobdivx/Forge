// @ts-nocheck
/**
 * forge-tools.ts — Abstractions d'outils inspirées des patterns Claude Code.
 * Réimplémenté from scratch pour DevForge (Astro/Node.js).
 * SERVEUR UNIQUEMENT — utilise child_process et fs.
 */
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import {
  resolveProjectPath,
  getReposRoot,
  isSafeRepoDirName,
} from './forge-repos';

// ── Types ─────────────────────────────────────────────────────────────────────

export type ToolContext = {
  agentId?: string;
  email?: string;
};

export type ToolResult<T = unknown> = {
  ok: boolean;
  output: T;
  error?: string;
  durationMs: number;
  toolName: string;
};

export type ToolParam = {
  type: 'string' | 'number' | 'boolean';
  description: string;
  required?: boolean;
  default?: unknown;
};

export interface ForgeTool<
  TInput = Record<string, unknown>,
  TOutput = unknown,
> {
  name: string;
  description: string;
  category: 'git' | 'docker' | 'file' | 'system';
  params: Record<string, ToolParam>;
  execute(input: TInput, ctx: ToolContext): Promise<ToolResult<TOutput>>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function safeExec(cmd: string, cwd: string): { stdout: string; ok: boolean } {
  try {
    const stdout = execSync(cmd, {
      cwd,
      timeout: 15_000,
      encoding: 'utf8',
      maxBuffer: 512 * 1024,
    });
    return { stdout: String(stdout).trim(), ok: true };
  } catch (e: any) {
    const out = [e.stdout || '', e.stderr || ''].join('\n').trim();
    return { stdout: out || e.message || 'Erreur', ok: false };
  }
}

async function run<T>(
  toolName: string,
  fn: () => ToolResult<T> | Promise<ToolResult<T>>,
): Promise<ToolResult<T>> {
  const start = Date.now();
  try {
    const result = await fn();
    return { ...result, durationMs: Date.now() - start };
  } catch (e: any) {
    return {
      ok: false,
      output: null as unknown as T,
      error: e.message,
      durationMs: Date.now() - start,
      toolName,
    };
  }
}

// ── Git ───────────────────────────────────────────────────────────────────────

const gitStatus: ForgeTool<{ project: string }, string> = {
  name: 'git_status',
  description: 'Statut git du projet',
  category: 'git',
  params: {
    project: { type: 'string', description: 'Nom du projet', required: true },
  },
  execute: ({ project }, _ctx) =>
    run('git_status', () => {
      const dir = resolveProjectPath(project);
      if (!dir)
        return {
          ok: false,
          output: '',
          error: `Projet introuvable: ${project}`,
          durationMs: 0,
          toolName: 'git_status',
        };
      const { stdout, ok } = safeExec('git status', dir);
      return { ok, output: stdout, toolName: 'git_status', durationMs: 0 };
    }),
};

const gitLog: ForgeTool<{ project: string; limit?: number }, string> = {
  name: 'git_log',
  description: 'Derniers commits du projet',
  category: 'git',
  params: {
    project: { type: 'string', description: 'Nom du projet', required: true },
    limit: {
      type: 'number',
      description: 'Nombre de commits (défaut 10)',
      default: 10,
    },
  },
  execute: ({ project, limit = 10 }, _ctx) =>
    run('git_log', () => {
      const dir = resolveProjectPath(project);
      if (!dir)
        return {
          ok: false,
          output: '',
          error: `Projet introuvable: ${project}`,
          durationMs: 0,
          toolName: 'git_log',
        };
      const n = Math.min(Number(limit) || 10, 50);
      const { stdout, ok } = safeExec(
        `git log --oneline --decorate -${n}`,
        dir,
      );
      return { ok, output: stdout, toolName: 'git_log', durationMs: 0 };
    }),
};

const gitDiff: ForgeTool<{ project: string; staged?: boolean }, string> = {
  name: 'git_diff',
  description: 'Modifications en cours du projet',
  category: 'git',
  params: {
    project: { type: 'string', description: 'Nom du projet', required: true },
    staged: {
      type: 'boolean',
      description: 'Fichiers stagés uniquement',
      default: false,
    },
  },
  execute: ({ project, staged = false }, _ctx) =>
    run('git_diff', () => {
      const dir = resolveProjectPath(project);
      if (!dir)
        return {
          ok: false,
          output: '',
          error: `Projet introuvable: ${project}`,
          durationMs: 0,
          toolName: 'git_diff',
        };
      const cmd = staged
        ? 'git diff --staged --name-status'
        : 'git diff --name-status';
      const { stdout, ok } = safeExec(cmd, dir);
      return {
        ok,
        output: stdout || '(aucune modification)',
        toolName: 'git_diff',
        durationMs: 0,
      };
    }),
};

const gitBranch: ForgeTool<{ project: string }, string> = {
  name: 'git_branch',
  description: 'Branches du projet',
  category: 'git',
  params: {
    project: { type: 'string', description: 'Nom du projet', required: true },
  },
  execute: ({ project }, _ctx) =>
    run('git_branch', () => {
      const dir = resolveProjectPath(project);
      if (!dir)
        return {
          ok: false,
          output: '',
          error: `Projet introuvable: ${project}`,
          durationMs: 0,
          toolName: 'git_branch',
        };
      const { stdout, ok } = safeExec('git branch -a', dir);
      return { ok, output: stdout, toolName: 'git_branch', durationMs: 0 };
    }),
};

// ── File ──────────────────────────────────────────────────────────────────────

const fileList: ForgeTool<{ project: string; subpath?: string }, string[]> = {
  name: 'file_list',
  description: "Liste les fichiers d'un répertoire",
  category: 'file',
  params: {
    project: { type: 'string', description: 'Nom du projet', required: true },
    subpath: {
      type: 'string',
      description: 'Sous-répertoire relatif à la racine (optionnel)',
    },
  },
  execute: ({ project, subpath = '' }, _ctx) =>
    run('file_list', () => {
      const base = resolveProjectPath(project);
      if (!base)
        return {
          ok: false,
          output: [],
          error: `Projet introuvable: ${project}`,
          durationMs: 0,
          toolName: 'file_list',
        };
      const dir = subpath ? path.join(base, subpath) : base;
      if (!path.resolve(dir).startsWith(base))
        return {
          ok: false,
          output: [],
          error: 'Chemin non autorisé',
          durationMs: 0,
          toolName: 'file_list',
        };
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        const output = entries
          .filter(
            (e) =>
              !e.name.startsWith('.') ||
              e.name === '.gitignore' ||
              e.name === '.env.example',
          )
          .slice(0, 100)
          .map((e) => (e.isDirectory() ? `${e.name}/` : e.name));
        return { ok: true, output, toolName: 'file_list', durationMs: 0 };
      } catch (e: any) {
        return {
          ok: false,
          output: [],
          error: e.message,
          durationMs: 0,
          toolName: 'file_list',
        };
      }
    }),
};

const fileRead: ForgeTool<
  { project: string; filepath: string; maxLines?: number },
  string
> = {
  name: 'file_read',
  description: "Lit un fichier du projet (100 lignes max par défaut)",
  category: 'file',
  params: {
    project: { type: 'string', description: 'Nom du projet', required: true },
    filepath: {
      type: 'string',
      description: 'Chemin relatif à la racine du projet',
      required: true,
    },
    maxLines: {
      type: 'number',
      description: 'Nombre max de lignes (défaut 100)',
      default: 100,
    },
  },
  execute: ({ project, filepath, maxLines = 100 }, _ctx) =>
    run('file_read', () => {
      const base = resolveProjectPath(project);
      if (!base)
        return {
          ok: false,
          output: '',
          error: `Projet introuvable: ${project}`,
          durationMs: 0,
          toolName: 'file_read',
        };
      const full = path.resolve(path.join(base, filepath));
      if (!full.startsWith(base))
        return {
          ok: false,
          output: '',
          error: 'Chemin non autorisé',
          durationMs: 0,
          toolName: 'file_read',
        };
      try {
        const text = fs.readFileSync(full, 'utf8');
        const lines = text
          .split('\n')
          .slice(0, Math.min(Number(maxLines) || 100, 500));
        return {
          ok: true,
          output: lines.join('\n'),
          toolName: 'file_read',
          durationMs: 0,
        };
      } catch (e: any) {
        return {
          ok: false,
          output: '',
          error: e.message,
          durationMs: 0,
          toolName: 'file_read',
        };
      }
    }),
};

const fileTree: ForgeTool<{ project: string; depth?: number }, string> = {
  name: 'file_tree',
  description: 'Arborescence du projet',
  category: 'file',
  params: {
    project: { type: 'string', description: 'Nom du projet', required: true },
    depth: {
      type: 'number',
      description: 'Profondeur max (défaut 2)',
      default: 2,
    },
  },
  execute: ({ project, depth = 2 }, _ctx) =>
    run('file_tree', () => {
      const dir = resolveProjectPath(project);
      if (!dir)
        return {
          ok: false,
          output: '',
          error: `Projet introuvable: ${project}`,
          durationMs: 0,
          toolName: 'file_tree',
        };
      const d = Math.min(Number(depth) || 2, 4);
      const { stdout, ok } = safeExec(
        `find . -maxdepth ${d} -not -path '*/node_modules/*' -not -path '*/.git/*' -not -path '*/.next/*' | sort | head -80`,
        dir,
      );
      return { ok, output: stdout, toolName: 'file_tree', durationMs: 0 };
    }),
};

// ── Docker ────────────────────────────────────────────────────────────────────

const dockerPs: ForgeTool<Record<string, never>, string> = {
  name: 'docker_ps',
  description: 'Liste les conteneurs Docker actifs',
  category: 'docker',
  params: {},
  execute: (_input, _ctx) =>
    run('docker_ps', () => {
      const { stdout, ok } = safeExec(
        'docker ps --format "table {{.Names}}\\t{{.Status}}\\t{{.Image}}"',
        '/tmp',
      );
      return {
        ok,
        output: stdout || '(aucun conteneur actif)',
        toolName: 'docker_ps',
        durationMs: 0,
      };
    }),
};

const dockerLogs: ForgeTool<
  { container: string; lines?: number },
  string
> = {
  name: 'docker_logs',
  description: "Logs d'un conteneur Docker",
  category: 'docker',
  params: {
    container: {
      type: 'string',
      description: 'Nom ou ID du conteneur',
      required: true,
    },
    lines: {
      type: 'number',
      description: 'Nombre de lignes (défaut 50)',
      default: 50,
    },
  },
  execute: ({ container, lines = 50 }, _ctx) =>
    run('docker_logs', () => {
      const safe = container.replace(/[^a-zA-Z0-9_\-\.]/g, '');
      if (!safe)
        return {
          ok: false,
          output: '',
          error: 'Nom de conteneur invalide',
          durationMs: 0,
          toolName: 'docker_logs',
        };
      const n = Math.min(Number(lines) || 50, 200);
      const { stdout, ok } = safeExec(
        `docker logs --tail ${n} ${safe} 2>&1`,
        '/tmp',
      );
      return { ok, output: stdout, toolName: 'docker_logs', durationMs: 0 };
    }),
};

// ── System ────────────────────────────────────────────────────────────────────

const projectsList: ForgeTool<Record<string, never>, string[]> = {
  name: 'projects_list',
  description: 'Liste tous les projets dans FORGE_REPOS_ROOT',
  category: 'system',
  params: {},
  execute: (_input, _ctx) =>
    run('projects_list', () => {
      const root = getReposRoot();
      try {
        const entries = fs.readdirSync(root, { withFileTypes: true });
        const output = entries
          .filter((e) => e.isDirectory() && isSafeRepoDirName(e.name))
          .map((e) => e.name)
          .sort();
        return {
          ok: true,
          output,
          toolName: 'projects_list',
          durationMs: 0,
        };
      } catch (e: any) {
        return {
          ok: false,
          output: [],
          error: e.message,
          durationMs: 0,
          toolName: 'projects_list',
        };
      }
    }),
};

// ── Registry ──────────────────────────────────────────────────────────────────

const ALL_TOOLS: ForgeTool[] = [
  gitStatus as ForgeTool,
  gitLog as ForgeTool,
  gitDiff as ForgeTool,
  gitBranch as ForgeTool,
  fileList as ForgeTool,
  fileRead as ForgeTool,
  fileTree as ForgeTool,
  dockerPs as ForgeTool,
  dockerLogs as ForgeTool,
  projectsList as ForgeTool,
];

export const toolRegistry = {
  list: () =>
    ALL_TOOLS.map(({ name, description, category, params }) => ({
      name,
      description,
      category,
      params,
    })),
  get: (name: string): ForgeTool | undefined =>
    ALL_TOOLS.find((t) => t.name === name),
  run: async (
    name: string,
    input: Record<string, unknown> = {},
    ctx: ToolContext = {},
  ): Promise<ToolResult> => {
    const tool = ALL_TOOLS.find((t) => t.name === name);
    if (!tool)
      return {
        ok: false,
        output: null,
        error: `Outil inconnu: ${name}`,
        durationMs: 0,
        toolName: name,
      };
    return tool.execute(input as any, ctx);
  },
};
