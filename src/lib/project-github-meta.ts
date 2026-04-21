// @ts-nocheck
/**
 * Synthèse du dossier `.github` d’un dépôt local (workflows, templates, dépendabot…).
 * Lecture disque uniquement — utile pour enrichir le contexte des agents Forge.
 */
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';

export type GithubWorkflowBrief = {
  /** Chemin relatif au repo, ex. `.github/workflows/ci.yml` */
  relativePath: string;
  /** Champ `name:` du workflow si détecté dans l’en-tête du fichier */
  workflowName: string | null;
};

export type GithubFolderSummary = {
  present: boolean;
  workflows: GithubWorkflowBrief[];
  dependabot: boolean;
  codeowners: false | 'root' | '.github';
  funding: boolean;
  issueTemplatesCount: number;
  pullRequestTemplatePaths: string[];
  /** Chemins relatifs remarquables sous `.github` (plafonnés) */
  notablePaths: string[];
  /** `git remote get-url origin` si disponible */
  remoteOriginUrl: string | null;
};

const WORKFLOW_HEADER_LINES = 160;
const WORKFLOW_READ_BYTES = 12_288;

function safeReadText(absFile: string, maxBytes: number): string {
  try {
    const fd = fs.openSync(absFile, 'r');
    try {
      const buf = Buffer.allocUnsafe(Math.min(maxBytes, fs.statSync(absFile).size || maxBytes));
      const n = fs.readSync(fd, buf, 0, buf.length, 0);
      return buf.slice(0, n).toString('utf-8');
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return '';
  }
}

/** Première ligne YAML `name:` plausible en tête de fichier workflow. */
export function extractWorkflowNameFromYaml(raw: string): string | null {
  const lines = raw.split(/\r?\n/).slice(0, WORKFLOW_HEADER_LINES);
  for (const line of lines) {
    const m = /^\s*name:\s*(.+)\s*$/.exec(line);
    if (!m) continue;
    let v = m[1].trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    return v || null;
  }
  return null;
}

function listWorkflowFiles(workflowsDir: string): string[] {
  const out: string[] = [];
  try {
    const entries = fs.readdirSync(workflowsDir, { withFileTypes: true });
    for (const e of entries) {
      if (!e.isFile()) continue;
      const n = e.name.toLowerCase();
      if (n.endsWith('.yml') || n.endsWith('.yaml')) out.push(e.name);
    }
  } catch {
    /* ignore */
  }
  return out.sort().slice(0, 40);
}

function countIssueTemplates(githubDir: string): number {
  let n = 0;
  const legacy = path.join(githubDir, 'ISSUE_TEMPLATE.md');
  try {
    if (fs.existsSync(legacy) && fs.statSync(legacy).isFile()) n += 1;
  } catch {
    /* ignore */
  }
  const dir = path.join(githubDir, 'ISSUE_TEMPLATE');
  try {
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return n;
    const walk = (abs: string, depth: number) => {
      if (depth > 4 || n >= 80) return;
      const entries = fs.readdirSync(abs, { withFileTypes: true });
      for (const e of entries) {
        if (n >= 80) break;
        const full = path.join(abs, e.name);
        if (e.isDirectory()) {
          walk(full, depth + 1);
        } else {
          const low = e.name.toLowerCase();
          if (low.endsWith('.md') || low.endsWith('.yaml') || low.endsWith('.yml')) n += 1;
        }
      }
    };
    walk(dir, 0);
  } catch {
    /* ignore */
  }
  return n;
}

function collectPullRequestTemplates(projectRoot: string, githubDir: string): string[] {
  const paths: string[] = [];
  const candidates = [
    path.join(githubDir, 'pull_request_template.md'),
    path.join(githubDir, 'PULL_REQUEST_TEMPLATE.md'),
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p) && fs.statSync(p).isFile()) {
        paths.push(path.relative(projectRoot, p).replace(/\\/g, '/'));
      }
    } catch {
      /* ignore */
    }
  }
  const sub = path.join(githubDir, 'PULL_REQUEST_TEMPLATE');
  try {
    if (fs.existsSync(sub) && fs.statSync(sub).isDirectory()) {
      const entries = fs.readdirSync(sub, { withFileTypes: true });
      for (const e of entries) {
        if (!e.isFile()) continue;
        const low = e.name.toLowerCase();
        if (!low.endsWith('.md')) continue;
        paths.push(
          path
            .join('.github', 'PULL_REQUEST_TEMPLATE', e.name)
            .replace(/\\/g, '/'),
        );
        if (paths.length >= 12) break;
      }
    }
  } catch {
    /* ignore */
  }
  return paths;
}

function resolveCodeowners(projectRoot: string, githubDir: string): false | 'root' | '.github' {
  try {
    const g = path.join(githubDir, 'CODEOWNERS');
    if (fs.existsSync(g) && fs.statSync(g).isFile()) return '.github';
  } catch {
    /* ignore */
  }
  try {
    const r = path.join(projectRoot, 'CODEOWNERS');
    if (fs.existsSync(r) && fs.statSync(r).isFile()) return 'root';
  } catch {
    /* ignore */
  }
  return false;
}

function collectNotableGithubPaths(githubDir: string): string[] {
  const out: string[] = [];
  const skipRootNames = new Set([
    'workflows',
    'ISSUE_TEMPLATE',
    'PULL_REQUEST_TEMPLATE',
  ]);
  try {
    const entries = fs.readdirSync(githubDir, { withFileTypes: true });
    for (const e of entries) {
      if (out.length >= 48) break;
      const rel = path.join('.github', e.name).replace(/\\/g, '/');
      if (e.isDirectory()) {
        if (!skipRootNames.has(e.name)) out.push(`${rel}/`);
      } else {
        out.push(rel);
      }
    }
  } catch {
    /* ignore */
  }
  try {
    const w = path.join(githubDir, 'workflows');
    if (fs.existsSync(w) && fs.statSync(w).isDirectory()) {
      const wf = fs.readdirSync(w, { withFileTypes: true });
      for (const e of wf) {
        if (!e.isFile()) continue;
        if (out.length >= 48) break;
        const low = e.name.toLowerCase();
        if (low.endsWith('.yml') || low.endsWith('.yaml')) {
          out.push(`.github/workflows/${e.name}`.replace(/\\/g, '/'));
        }
      }
    }
  } catch {
    /* ignore */
  }
  return out.sort().slice(0, 48);
}

function readGitRemoteOrigin(projectRoot: string): string | null {
  try {
    const u = execFileSync('git', ['remote', 'get-url', 'origin'], {
      cwd: projectRoot,
      encoding: 'utf-8',
      timeout: 6000,
      windowsHide: true,
      maxBuffer: 65_536,
    }).trim();
    return u || null;
  } catch {
    return null;
  }
}

/**
 * Résume le contenu utile de `.github` pour les agents (CI, templates, dépendabot).
 */
export function summarizeGithubFolder(projectRoot: string): GithubFolderSummary {
  const githubDir = path.join(projectRoot, '.github');
  let present = false;
  try {
    present = fs.existsSync(githubDir) && fs.statSync(githubDir).isDirectory();
  } catch {
    present = false;
  }

  if (!present) {
    return {
      present: false,
      workflows: [],
      dependabot: false,
      codeowners: false,
      funding: false,
      issueTemplatesCount: 0,
      pullRequestTemplatePaths: [],
      notablePaths: [],
      remoteOriginUrl: readGitRemoteOrigin(projectRoot),
    };
  }

  const workflowsDir = path.join(githubDir, 'workflows');
  const workflowFiles = fs.existsSync(workflowsDir) ? listWorkflowFiles(workflowsDir) : [];

  const workflows: GithubWorkflowBrief[] = [];
  for (const fn of workflowFiles) {
    const abs = path.join(workflowsDir, fn);
    const raw = safeReadText(abs, WORKFLOW_READ_BYTES);
    const rel = `.github/workflows/${fn}`.replace(/\\/g, '/');
    workflows.push({
      relativePath: rel,
      workflowName: extractWorkflowNameFromYaml(raw),
    });
  }

  let dependabot = false;
  try {
    for (const name of ['dependabot.yml', 'dependabot.yaml']) {
      const p = path.join(githubDir, name);
      if (fs.existsSync(p) && fs.statSync(p).isFile()) {
        dependabot = true;
        break;
      }
    }
  } catch {
    dependabot = false;
  }

  let funding = false;
  try {
    for (const name of ['FUNDING.yml', 'funding.yml']) {
      const p = path.join(githubDir, name);
      if (fs.existsSync(p) && fs.statSync(p).isFile()) {
        funding = true;
        break;
      }
    }
  } catch {
    funding = false;
  }

  return {
    present: true,
    workflows,
    dependabot,
    codeowners: resolveCodeowners(projectRoot, githubDir),
    funding,
    issueTemplatesCount: countIssueTemplates(githubDir),
    pullRequestTemplatePaths: collectPullRequestTemplates(projectRoot, githubDir),
    notablePaths: collectNotableGithubPaths(githubDir),
    remoteOriginUrl: readGitRemoteOrigin(projectRoot),
  };
}
