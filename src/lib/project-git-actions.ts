import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/** Refuse les refs dangereuses (path traversal, espaces exotiques). */
export function isSafeGitBranchName(name: string): boolean {
  const s = String(name || '').trim();
  if (!s || s.length > 240) return false;
  if (/\.\.|[\x00-\x1f]/.test(s)) return false;
  return /^[a-zA-Z0-9._/@/-]+$/.test(s);
}

export type BranchListResult = {
  current: string;
  local: string[];
  remote: string[];
  error?: string;
};

export async function listGitBranchesDetailed(cwd: string): Promise<BranchListResult> {
  try {
    const { stdout: curOut } = await execFileAsync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      cwd,
      encoding: 'utf8',
      maxBuffer: 2 * 1024 * 1024,
      windowsHide: true,
    });
    const current = String(curOut || '').trim() || 'HEAD';

    const { stdout: locOut } = await execFileAsync(
      'git',
      ['for-each-ref', 'refs/heads/', '--format=%(refname:short)'],
      { cwd, encoding: 'utf8', maxBuffer: 2 * 1024 * 1024, windowsHide: true },
    );
    const local = Array.from(
      new Set(
        String(locOut || '')
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean),
      ),
    ).sort((a, b) => a.localeCompare(b));

    const { stdout: remOut } = await execFileAsync(
      'git',
      ['for-each-ref', 'refs/remotes/origin/', '--format=%(refname:short)'],
      { cwd, encoding: 'utf8', maxBuffer: 2 * 1024 * 1024, windowsHide: true },
    );
    const remote = Array.from(
      new Set(
        String(remOut || '')
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean)
          .map((s) => s.replace(/^origin\//, ''))
          .filter((s) => s && !s.includes('HEAD')),
      ),
    ).sort((a, b) => a.localeCompare(b));

    return { current, local, remote };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { current: '', local: [], remote: [], error: msg };
  }
}

function gitWithGithubAuth(cwd: string, token: string, gitArgs: string[]) {
  return execFileAsync('git', ['-c', `http.extraHeader=Authorization: Bearer ${token}`, ...gitArgs], {
    cwd,
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
    windowsHide: true,
  });
}

export async function gitPullOrigin(
  cwd: string,
  token: string,
  branch: string,
): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  const b = String(branch || '').trim();
  if (!isSafeGitBranchName(b)) {
    return { ok: false, stdout: '', stderr: 'Branche invalide' };
  }
  try {
    const r = await gitWithGithubAuth(cwd, token, ['pull', 'origin', b]);
    return { ok: true, stdout: r.stdout || '', stderr: r.stderr || '' };
  } catch (e: unknown) {
    const err = e as { stdout?: string; stderr?: string; message?: string };
    return {
      ok: false,
      stdout: err.stdout || '',
      stderr: err.stderr || err.message || String(e),
    };
  }
}

export async function gitPushHeadToBranch(
  cwd: string,
  token: string,
  remoteBranch: string,
): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  const b = String(remoteBranch || '').trim();
  if (!isSafeGitBranchName(b)) {
    return { ok: false, stdout: '', stderr: 'Branche distante invalide' };
  }
  try {
    const r = await gitWithGithubAuth(cwd, token, ['push', 'origin', `HEAD:refs/heads/${b}`]);
    return { ok: true, stdout: r.stdout || '', stderr: r.stderr || '' };
  } catch (e: unknown) {
    const err = e as { stdout?: string; stderr?: string; message?: string };
    return {
      ok: false,
      stdout: err.stdout || '',
      stderr: err.stderr || err.message || String(e),
    };
  }
}

export async function gitCheckoutBranch(
  cwd: string,
  branch: string,
): Promise<{ ok: boolean; stderr: string }> {
  const b = String(branch || '').trim();
  if (!isSafeGitBranchName(b)) {
    return { ok: false, stderr: 'Branche invalide' };
  }
  try {
    await execFileAsync('git', ['checkout', b], {
      cwd,
      encoding: 'utf8',
      maxBuffer: 2 * 1024 * 1024,
      windowsHide: true,
    });
    return { ok: true, stderr: '' };
  } catch (e: unknown) {
    const err = e as { stderr?: string; message?: string };
    return { ok: false, stderr: err.stderr || err.message || String(e) };
  }
}

const STASH_MSG_MAX = 220;

/** Met de côté l’index + l’arbre de travail (y compris fichiers non suivis). */
export async function gitStashPushIncludingUntracked(
  cwd: string,
  message: string,
): Promise<{ ok: boolean; stderr: string; nothingToStash?: boolean }> {
  const msg = String(message || 'Forge stash').trim().slice(0, STASH_MSG_MAX);
  try {
    await execFileAsync('git', ['stash', 'push', '-u', '-m', msg], {
      cwd,
      encoding: 'utf8',
      maxBuffer: 4 * 1024 * 1024,
      windowsHide: true,
    });
    return { ok: true, stderr: '' };
  } catch (e: unknown) {
    const err = e as { stderr?: string; stdout?: string; message?: string };
    const combined = `${err.stderr || ''} ${err.stdout || ''} ${err.message || ''}`;
    if (/no local changes to save/i.test(combined)) {
      return { ok: true, stderr: '', nothingToStash: true };
    }
    return { ok: false, stderr: err.stderr || err.message || String(e) };
  }
}

/** Ré-applique le dernier stash (après un pull). */
export async function gitStashPop(cwd: string): Promise<{ ok: boolean; stderr: string }> {
  try {
    await execFileAsync('git', ['stash', 'pop'], {
      cwd,
      encoding: 'utf8',
      maxBuffer: 4 * 1024 * 1024,
      windowsHide: true,
    });
    return { ok: true, stderr: '' };
  } catch (e: unknown) {
    const err = e as { stderr?: string; message?: string };
    return { ok: false, stderr: err.stderr || err.message || String(e) };
  }
}

export async function gitCommitAll(
  cwd: string,
  message: string,
): Promise<{ ok: boolean; committed: boolean; stderr: string; shortSha?: string }> {
  const msg = String(message || '').trim();
  if (msg.length < 2) {
    return { ok: false, committed: false, stderr: 'Message trop court' };
  }
  try {
    const st = await execFileAsync('git', ['status', '--porcelain'], {
      cwd,
      encoding: 'utf8',
      windowsHide: true,
    });
    if (!String(st.stdout || '').trim()) {
      return { ok: true, committed: false, stderr: '', shortSha: undefined };
    }
    await execFileAsync('git', ['add', '-A'], { cwd, encoding: 'utf8', windowsHide: true });
    await execFileAsync('git', ['commit', '-m', msg], { cwd, encoding: 'utf8', windowsHide: true });
    const shaOut = await execFileAsync('git', ['rev-parse', '--short', 'HEAD'], {
      cwd,
      encoding: 'utf8',
      windowsHide: true,
    });
    const shortSha = String(shaOut.stdout || '').trim();
    return { ok: true, committed: true, stderr: '', shortSha };
  } catch (e: unknown) {
    const err = e as { stderr?: string; message?: string };
    return { ok: false, committed: false, stderr: err.stderr || err.message || String(e) };
  }
}
