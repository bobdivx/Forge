import type { APIRoute } from 'astro';
import { exec } from 'node:child_process';
import util from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import { getReposRootResolved } from '../../lib/forge-repos';

const execPromise = util.promisify(exec);

const HASH_RE = /^[a-f0-9]{4,64}$/;
const APP_RE = /^[a-zA-Z0-9._-]+$/;

/** Sentinels pour le diff de l'arbre de travail (modifications non commitées). */
function isWorkingHash(h: string): boolean {
  const k = String(h || '').toUpperCase();
  return k === 'WORKING' || k === 'WIP' || k === 'HEAD';
}

/** Empêche un argument file de ressembler à un flag git ou à du path traversal. */
function isSafeFileArg(p: string): boolean {
  const t = String(p || '').trim();
  if (!t) return false;
  if (t.startsWith('-')) return false;
  if (t.includes('..')) return false;
  if (t.length > 500) return false;
  return true;
}

type FileChange = {
  status: 'A' | 'M' | 'D' | 'R' | 'C' | 'T' | 'U' | 'X';
  path: string;
  oldPath?: string;
};

/**
 * Liste les fichiers touchés par un commit (statut + chemin), via `git show --name-status -z`.
 */
async function listFilesForCommit(cwd: string, hash: string): Promise<FileChange[]> {
  const { stdout } = await execPromise(
    `git show --no-color --name-status -z --format= ${hash}`,
    { cwd, maxBuffer: 8 * 1024 * 1024 },
  );
  const tokens = stdout.split('\x00').filter((t) => t.length > 0);
  const files: FileChange[] = [];
  let i = 0;
  while (i < tokens.length) {
    const code = (tokens[i++].trim()[0] ?? 'X') as FileChange['status'];
    if (code === 'R' || code === 'C') {
      const oldPath = tokens[i++] ?? '';
      const newPath = tokens[i++] ?? '';
      files.push({ status: code, path: newPath, oldPath });
    } else {
      const filePath = tokens[i++] ?? '';
      files.push({ status: code, path: filePath });
    }
  }
  return files;
}

export const GET: APIRoute = async ({ request }) => {
  try {
    const url = new URL(request.url);
    const appName = url.searchParams.get('app');
    const hash = url.searchParams.get('hash');
    const file = url.searchParams.get('file');
    const wantJson = url.searchParams.get('list') === '1';

    if (!appName || !hash) {
      return new Response(
        JSON.stringify({ error: 'Paramètres requis : app, hash' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      );
    }
    if (!APP_RE.test(appName)) {
      return new Response(JSON.stringify({ error: 'Format app invalide' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (!isWorkingHash(hash) && !HASH_RE.test(hash)) {
      return new Response(JSON.stringify({ error: 'Format hash invalide' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (file != null && !isSafeFileArg(file)) {
      return new Response(JSON.stringify({ error: 'Chemin de fichier invalide' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const reposRoot = await getReposRootResolved();
    const appPath = path.join(reposRoot, appName);
    if (!fs.existsSync(appPath)) {
      return new Response(JSON.stringify({ error: 'Projet introuvable' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (wantJson) {
      if (isWorkingHash(hash)) {
        return new Response(
          JSON.stringify({ error: 'list=1 non supporté pour le working tree' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } },
        );
      }
      const files = await listFilesForCommit(appPath, hash);
      return new Response(JSON.stringify({ hash, files }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    let diff = '';
    if (isWorkingHash(hash)) {
      // Mode "modifs en cours" : on cumule staged (--cached HEAD) + unstaged (HEAD) + untracked.
      if (file) {
        const safeFile = file.replace(/"/g, '\\"');
        // Untracked ? Tester via ls-files
        const tracked = await execPromise(
          `git ls-files --error-unmatch -- "${safeFile}"`,
          { cwd: appPath, maxBuffer: 1024 * 1024 },
        ).then(() => true).catch(() => false);
        if (tracked) {
          const [staged, unstaged] = await Promise.all([
            execPromise(`git diff --no-color --cached HEAD -- "${safeFile}"`, {
              cwd: appPath,
              maxBuffer: 16 * 1024 * 1024,
            }).then((r) => r.stdout).catch(() => ''),
            execPromise(`git diff --no-color HEAD -- "${safeFile}"`, {
              cwd: appPath,
              maxBuffer: 16 * 1024 * 1024,
            }).then((r) => r.stdout).catch(() => ''),
          ]);
          const sParts: string[] = [];
          if (staged.trim()) sParts.push('### staged ###\n' + staged);
          if (unstaged.trim()) sParts.push('### unstaged ###\n' + unstaged);
          diff = sParts.join('\n') || `(Aucun changement détecté pour ${file})`;
        } else {
          // Fichier non suivi : diff vs /dev/null (équivalent NUL sur Windows via git interne)
          const devnull = process.platform === 'win32' ? 'NUL' : '/dev/null';
          const r = await execPromise(
            `git diff --no-color --no-index -- ${devnull} "${safeFile}"`,
            { cwd: appPath, maxBuffer: 16 * 1024 * 1024 },
          )
            .then((x) => x.stdout)
            // git diff --no-index renvoie code 1 quand il y a des diffs : ça déclenche une exception
            .catch((err: any) => String(err?.stdout ?? ''));
          diff = r || `(fichier non suivi vide : ${file})`;
        }
      } else {
        const [staged, unstaged] = await Promise.all([
          execPromise('git diff --no-color --cached HEAD', {
            cwd: appPath,
            maxBuffer: 16 * 1024 * 1024,
          }).then((r) => r.stdout).catch(() => ''),
          execPromise('git diff --no-color HEAD', {
            cwd: appPath,
            maxBuffer: 16 * 1024 * 1024,
          }).then((r) => r.stdout).catch(() => ''),
        ]);
        const parts: string[] = [];
        if (staged.trim()) parts.push('### staged ###\n' + staged);
        if (unstaged.trim()) parts.push('### unstaged ###\n' + unstaged);
        diff = parts.join('\n') || '(Pas de modifications non commitées détectées)';
      }
    } else if (file) {
      const safeFile = file.replace(/"/g, '\\"');
      const r = await execPromise(`git show --no-color ${hash} -- "${safeFile}"`, {
        cwd: appPath,
        maxBuffer: 16 * 1024 * 1024,
      });
      diff = r.stdout;
    } else {
      const r = await execPromise(`git show --no-color ${hash}`, {
        cwd: appPath,
        maxBuffer: 16 * 1024 * 1024,
      });
      diff = r.stdout;
    }

    return new Response(JSON.stringify({ hash, file: file ?? null, diff }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error?.message || 'Erreur git show' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
};
