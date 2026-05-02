// @ts-nocheck
/**
 * forge-tools.ts — Abstractions d'outils inspirées des patterns Claude Code.
 * Réimplémenté from scratch pour ZimaDev (Astro/Node.js).
 * SERVEUR UNIQUEMENT — utilise child_process et fs.
 */
import { execFileSync, execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import {
  resolveProjectPath,
  getReposRoot,
  isSafeRepoDirName,
} from './forge-repos';
import { summarizeGithubFolder, type GithubFolderSummary } from './project-github-meta';
import { getConfig } from './config-db';
import { loadAstroDb } from './load-astro-db';
import { eq } from 'drizzle-orm';
import { isGithubAutomationAgent } from './agent-github-auth';

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
    run('git_status', async () => {
      const dir = await resolveProjectPath(project);
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
    run('git_log', async () => {
      const dir = await resolveProjectPath(project);
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
    run('git_diff', async () => {
      const dir = await resolveProjectPath(project);
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
    run('git_branch', async () => {
      const dir = await resolveProjectPath(project);
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
    run('file_list', async () => {
      const base = await resolveProjectPath(project);
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
    run('file_read', async () => {
      const base = await resolveProjectPath(project);
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
    run('file_tree', async () => {
      const dir = await resolveProjectPath(project);
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

// ── Scripts npm ───────────────────────────────────────────────────────────────

type ScriptEntry = { workdir: string; scripts: Record<string, string> };

const projectScripts: ForgeTool<
  { project: string; depth?: number },
  ScriptEntry[]
> = {
  name: 'project_scripts',
  description:
    'Liste tous les scripts npm/package.json disponibles dans un projet (racine + sous-dossiers). ' +
    'Retourne pour chaque package.json trouvé : le chemin relatif et les scripts définis.',
  category: 'file',
  params: {
    project: { type: 'string', description: 'Nom du projet', required: true },
    depth: {
      type: 'number',
      description: 'Profondeur de scan des sous-dossiers (défaut 2, max 3)',
      default: 2,
    },
  },
  execute: ({ project, depth = 2 }, _ctx) =>
    run('project_scripts', async () => {
      const base = await resolveProjectPath(project);
      if (!base)
        return {
          ok: false,
          output: [],
          error: `Projet introuvable: ${project}`,
          durationMs: 0,
          toolName: 'project_scripts',
        };

      const maxDepth = Math.min(Number(depth) || 2, 3);
      const results: ScriptEntry[] = [];
      const SKIP_DIRS = new Set(['node_modules', '.git', '.next', 'dist', 'build', '.cache', '.turbo']);

      function scanDir(absDir: string, relDir: string, currentDepth: number) {
        const pkgPath = path.join(absDir, 'package.json');
        if (fs.existsSync(pkgPath)) {
          try {
            const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
            const scripts: Record<string, string> = {};
            if (pkg.scripts && typeof pkg.scripts === 'object') {
              for (const [k, v] of Object.entries(pkg.scripts)) {
                if (typeof v === 'string') scripts[k] = v;
              }
            }
            if (Object.keys(scripts).length > 0) {
              results.push({ workdir: relDir || '.', scripts });
            }
          } catch {
            /* package.json invalide — ignorer */
          }
        }
        if (currentDepth >= maxDepth) return;
        try {
          const entries = fs.readdirSync(absDir, { withFileTypes: true });
          for (const e of entries) {
            if (!e.isDirectory() || SKIP_DIRS.has(e.name) || e.name.startsWith('.')) continue;
            const sub = path.join(absDir, e.name);
            // Sécurité : rester dans le projet
            if (!path.resolve(sub).startsWith(path.resolve(base))) continue;
            scanDir(sub, relDir ? `${relDir}/${e.name}` : e.name, currentDepth + 1);
          }
        } catch { /* ignore */ }
      }

      scanDir(base, '', 0);

      return {
        ok: true,
        output: results,
        toolName: 'project_scripts',
        durationMs: 0,
      };
    }),
};

// ── System ────────────────────────────────────────────────────────────────────

const githubMeta: ForgeTool<{ project: string }, GithubFolderSummary> = {
  name: 'github_meta',
  description:
    'Méta-données du dépôt : dossier .github (workflows, dependabot, templates, CODEOWNERS) et `git remote get-url origin`',
  category: 'system',
  params: {
    project: { type: 'string', description: 'Nom du projet (dossier sous la racine Forge)', required: true },
  },
  execute: ({ project }, _ctx) =>
    run('github_meta', async () => {
      const dir = await resolveProjectPath(project);
      if (!dir) {
        return {
          ok: false,
          output: {
            present: false,
            workflows: [],
            dependabot: false,
            codeowners: false,
            funding: false,
            issueTemplatesCount: 0,
            pullRequestTemplatePaths: [],
            notablePaths: [],
            remoteOriginUrl: null,
          },
          error: `Projet introuvable: ${project}`,
          durationMs: 0,
          toolName: 'github_meta',
        };
      }
      try {
        const output = summarizeGithubFolder(dir);
        return { ok: true, output, toolName: 'github_meta', durationMs: 0 };
      } catch (e) {
        return {
          ok: false,
          output: {
            present: false,
            workflows: [],
            dependabot: false,
            codeowners: false,
            funding: false,
            issueTemplatesCount: 0,
            pullRequestTemplatePaths: [],
            notablePaths: [],
            remoteOriginUrl: null,
          },
          error: e instanceof Error ? e.message : String(e),
          durationMs: 0,
          toolName: 'github_meta',
        };
      }
    }),
};

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

const githubCommit: ForgeTool<
  {
    project: string;
    agentId: string;
    message: string;
    files?: string[];
    push?: boolean;
    branch?: string;
  },
  { committed: boolean; pushed: boolean; branch: string; commitSha: string | null; note?: string }
> = {
  name: 'github_commit',
  description: 'Commit et push GitHub contrôlés pour agent GitHub',
  category: 'git',
  params: {
    project: { type: 'string', description: 'Nom du projet', required: true },
    agentId: { type: 'string', description: "ID agent demandeur", required: true },
    message: { type: 'string', description: 'Message de commit', required: true },
    push: { type: 'boolean', description: 'Pousser après commit', default: true },
    branch: { type: 'string', description: 'Branche cible optionnelle' },
  },
  execute: ({ project, agentId, message, files = [], push = true, branch }, _ctx) =>
    run('github_commit', async () => {
      const requester = String(agentId || '').trim();
      if (!isGithubAutomationAgent(requester)) {
        return {
          ok: false,
          output: { committed: false, pushed: false, branch: '', commitSha: null },
          error: `Agent non autorisé pour commit GitHub: ${requester || 'inconnu'}`,
          durationMs: 0,
          toolName: 'github_commit',
        };
      }
      const dir = await resolveProjectPath(project);
      if (!dir) {
        return {
          ok: false,
          output: { committed: false, pushed: false, branch: '', commitSha: null },
          error: `Projet introuvable: ${project}`,
          durationMs: 0,
          toolName: 'github_commit',
        };
      }
      const msg = String(message || '').trim();
      if (!msg) {
        return {
          ok: false,
          output: { committed: false, pushed: false, branch: '', commitSha: null },
          error: 'Message de commit requis',
          durationMs: 0,
          toolName: 'github_commit',
        };
      }
      const gitStatusBefore = safeExec('git status --porcelain', dir);
      if (!gitStatusBefore.ok) {
        return {
          ok: false,
          output: { committed: false, pushed: false, branch: '', commitSha: null },
          error: gitStatusBefore.stdout || 'Impossible de lire git status',
          durationMs: 0,
          toolName: 'github_commit',
        };
      }
      if (!String(gitStatusBefore.stdout || '').trim()) {
        return {
          ok: true,
          output: {
            committed: false,
            pushed: false,
            branch: '',
            commitSha: null,
            note: 'Aucun changement à commit',
          },
          durationMs: 0,
          toolName: 'github_commit',
        };
      }

      if (Array.isArray(files) && files.length > 0) {
        for (const f of files) {
          const rel = String(f || '').trim();
          if (!rel || rel.includes('..')) continue;
          execFileSync('git', ['add', '--', rel], { cwd: dir, encoding: 'utf8' });
        }
      } else {
        execFileSync('git', ['add', '-A'], { cwd: dir, encoding: 'utf8' });
      }

      execFileSync('git', ['commit', '-m', msg], { cwd: dir, encoding: 'utf8' });
      const sha = execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
        cwd: dir,
        encoding: 'utf8',
      }).trim();
      const currentBranch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
        cwd: dir,
        encoding: 'utf8',
      }).trim();
      let dbBranch = '';
      try {
        const { db, Project } = await loadAstroDb();
        const pRows = await db.select().from(Project).where(eq(Project.name, project));
        if (pRows.length > 0 && pRows[0].githubBranchDev) {
          dbBranch = pRows[0].githubBranchDev;
        }
      } catch (e) {}

      const targetBranch = String(branch || '').trim() || dbBranch || currentBranch;

      let pushed = false;
      if (push) {
        const token = String((await getConfig('githubToken')) || '').trim();
        if (!token) {
          return {
            ok: false,
            output: { committed: true, pushed: false, branch: targetBranch, commitSha: sha },
            error: 'Token GitHub absent dans Forge (settings.githubToken)',
            durationMs: 0,
            toolName: 'github_commit',
          };
        }
        execFileSync(
          'git',
          [
            '-c',
            `http.extraHeader=Authorization: Bearer ${token}`,
            'push',
            'origin',
            `HEAD:${targetBranch}`,
          ],
          { cwd: dir, encoding: 'utf8' },
        );
        pushed = true;
      }

      return {
        ok: true,
        output: {
          committed: true,
          pushed,
          branch: targetBranch,
          commitSha: sha,
        },
        durationMs: 0,
        toolName: 'github_commit',
      };
    }),
};


const githubPull: ForgeTool<{ project: string }, { pulled: boolean; branch: string; stdout: string }> = {
  name: 'github_pull',
  description: 'Pull GitHub contrôlé pour agent',
  category: 'git',
  params: {
    project: { type: 'string', description: 'Nom du projet', required: true },
  },
  execute: ({ project }, _ctx) =>
    run('github_pull', async () => {
      const dir = await resolveProjectPath(project);
      if (!dir) {
        return {
          ok: false,
          output: { pulled: false, branch: '', stdout: '' },
          error: `Projet introuvable: ${project}`,
          durationMs: 0,
          toolName: 'github_pull',
        };
      }

      const currentBranch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
        cwd: dir,
        encoding: 'utf8',
      }).trim();

      const token = String((await getConfig('githubToken')) || '').trim();
      if (!token) {
        return {
          ok: false,
          output: { pulled: false, branch: currentBranch, stdout: '' },
          error: 'Token GitHub absent dans Forge (settings.githubToken)',
          durationMs: 0,
          toolName: 'github_pull',
        };
      }

      let out = '';
      try {
        out = execFileSync(
          'git',
          [
            '-c',
            `http.extraHeader=Authorization: Bearer ${token}`,
            'pull',
            'origin',
            currentBranch,
          ],
          { cwd: dir, encoding: 'utf8' },
        );
      } catch(e) {
        return {
          ok: false,
          output: { pulled: false, branch: currentBranch, stdout: e.stdout || e.message },
          error: 'Erreur lors du pull',
          durationMs: 0,
          toolName: 'github_pull',
        };
      }

      return {
        ok: true,
        output: {
          pulled: true,
          branch: currentBranch,
          stdout: out,
        },
        durationMs: 0,
        toolName: 'github_pull',
      };
    }),
};

const systemExec: ForgeTool<{ project?: string; command: string }, string> = {
  name: 'system_exec',
  description: 'Exécute une commande système bash/shell',
  category: 'system',
  params: {
    project: { type: 'string', description: 'Nom du projet (optionnel)' },
    command: { type: 'string', description: 'La commande à exécuter', required: true },
  },
  execute: ({ project, command }, _ctx) =>
    run('system_exec', async () => {
      let dir = '/tmp';
      if (project) {
        const d = await resolveProjectPath(project);
        if (d) dir = d;
      }

      const { stdout, ok } = safeExec(command, dir);
      return { ok, output: stdout, toolName: 'system_exec', durationMs: 0 };
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
  projectScripts as ForgeTool,
  dockerPs as ForgeTool,
  dockerLogs as ForgeTool,
  systemExec as ForgeTool,
  githubCommit as ForgeTool,
  githubPull as ForgeTool,
  githubMeta as ForgeTool,
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
