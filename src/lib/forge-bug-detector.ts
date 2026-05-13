/**
 * Détecteur automatique de bugs dans les logs des serveurs de développement.
 *
 * - Tourne en arrière-plan (setInterval 30 s).
 * - Scanne les fichiers .forge/dev-pids/*.log de tous les projets actifs.
 * - Détecte les erreurs (stack traces, Error, FATAL…) et crée des AgentAppIssue.
 * - Notifie un agent ZimaOS si un nouveau bug est détecté.
 */

import fs from 'fs';
import path from 'path';
import { loadAstroDb } from './load-astro-db';
import { listRepoProjectPaths } from './forge-repos';
import { devPidsDir, readAppDashboardConfig } from './project-app-config';
import { invokeZimaOSSessionsSend } from './forge-gateway';

// ── Patterns d'erreur ────────────────────────────────────────────────────────

const ERROR_PATTERNS = [
  /^\s*(Error|TypeError|ReferenceError|SyntaxError|RangeError|URIError|EvalError):/m,
  /FATAL/m,
  /Unhandled (Promise )?[Rr]ejection/m,
  /Cannot (find module|read propert)/m,
  /\[ERROR\]/m,
  /\[FATAL\]/m,
  /Traceback \(most recent call last\)/m,   // Python
  /panic:/m,                                 // Go/Rust
  /EXCEPTION/m,
];

const IGNORE_PATTERNS = [
  /eslint/i,
  /DeprecationWarning/i,
  /ExperimentalWarning/i,
  /node:internal/,
];

// ── Positions de lecture (pour ne pas re-scanner depuis le début à chaque tick) ──

const _readPositions: Map<string, number> = new Map();

// ── État interne ─────────────────────────────────────────────────────────────

let _intervalHandle: ReturnType<typeof setInterval> | null = null;
let _initialScanHandle: ReturnType<typeof setTimeout> | null = null;
let _lastScanAt: Date | null = null;
let _lastScanDurationMs: number | null = null;
let _lastScanError: string | null = null;
let _lastScanBugsDetected = 0;

// ── Helpers ──────────────────────────────────────────────────────────────────

function readNewContent(filePath: string): string {
  try {
    const size = fs.statSync(filePath).size;
    const known = _readPositions.get(filePath) ?? 0;
    if (size <= known) return '';
    const toRead = Math.min(size - known, 64 * 1024); // 64 KB max par tick
    const buf = Buffer.alloc(toRead);
    const fd = fs.openSync(filePath, 'r');
    const bytesRead = fs.readSync(fd, buf, 0, toRead, known);
    fs.closeSync(fd);
    _readPositions.set(filePath, known + bytesRead);
    return buf.slice(0, bytesRead).toString('utf-8');
  } catch {
    return '';
  }
}

function extractErrorSnippet(content: string, matchIndex: number): string {
  const before = content.lastIndexOf('\n', matchIndex - 1);
  const start = before < 0 ? 0 : before + 1;
  const end = Math.min(start + 800, content.length);
  return content.slice(start, end).trim();
}

function detectErrors(content: string): Array<{ snippet: string; type: string }> {
  const found: Array<{ snippet: string; type: string }> = [];
  for (const pat of ERROR_PATTERNS) {
    const match = pat.exec(content);
    if (!match) continue;
    const snippet = extractErrorSnippet(content, match.index);
    if (IGNORE_PATTERNS.some((ig) => ig.test(snippet))) continue;
    found.push({ snippet, type: inferErrorType(snippet) });
    break; // un seul bug détecté par chunk pour éviter le spam
  }
  return found;
}

function inferErrorType(snippet: string): string {
  if (/Traceback|AttributeError|NameError/.test(snippet)) return 'runtime';
  if (/SyntaxError|SyntaxWarning/.test(snippet)) return 'build';
  if (/Cannot find module|Module not found/.test(snippet)) return 'build';
  if (/FATAL|panic/.test(snippet)) return 'runtime';
  return 'runtime';
}

function issueFingerprint(projectId: string | number, snippet: string): string {
  // Empreinte simple : première ligne du snippet (la plus stable)
  const firstLine = snippet.split('\n')[0].trim().slice(0, 200);
  return `${projectId}::${firstLine}`;
}

// ── Enregistrement en DB ──────────────────────────────────────────────────────

async function getOrCreateProjectId(projectPath: string): Promise<number | null> {
  try {
    const { db, Project } = await loadAstroDb();
    const folderName = path.basename(projectPath);
    const rows = await db.select().from(Project);
    const match = rows.find(
      (r) => r.name === folderName || String(r.name).toLowerCase() === folderName.toLowerCase()
    );
    return match ? match.id : null;
  } catch {
    return null;
  }
}

const _reportedFingerprints: Set<string> = new Set();

async function reportBug(
  projectPath: string,
  serverId: string,
  snippet: string,
  errorType: string
) {
  const projectId = await getOrCreateProjectId(projectPath);

  const fingerprint = issueFingerprint(projectId ?? path.basename(projectPath), snippet);
  if (_reportedFingerprints.has(fingerprint)) return;
  _reportedFingerprints.add(fingerprint);

  const title = snippet.split('\n')[0].trim().slice(0, 200);

  try {
    const { db, AgentAppIssue } = await loadAstroDb();
    const now = new Date();
    await db.insert(AgentAppIssue).values({
      ...(projectId != null ? { projectId } : {}),
      url: `forge://dev-server/${path.basename(projectPath)}/${serverId}`,
      errorType,
      title,
      detail: `[Détecté automatiquement · serveur ${serverId}]\n\n${snippet.slice(0, 2000)}`,
      status: 'open',
      reportedByAgentId: 'BUG_DETECTOR',
      createdAt: now,
      updatedAt: now,
    } as any);
  } catch (e) {
    console.warn('[bug-detector] DB insert failed:', e);
  }

  // Notification ZimaOS (async, non bloquant)
  const projectName = path.basename(projectPath);
  const msg =
    `[Forge — Bug détecté automatiquement]\n\n` +
    `Projet : ${projectName}\n` +
    `Serveur : ${serverId}\n\n` +
    `${title}\n\n` +
    `Extrait :\n\`\`\`\n${snippet.slice(0, 1200)}\n\`\`\`\n\n` +
    `Analyse et propose un correctif.`;

  invokeZimaOSSessionsSend({
    sessionKey: 'DEV_BACKEND',
    message: msg,
    asyncDelivery: true,
  }).catch(() => undefined);
}

// ── Scan principal ────────────────────────────────────────────────────────────

async function scanAllProjects() {
  const start = Date.now();
  let detected = 0;
  try {
    let projectPaths: string[] = [];
    try {
      projectPaths = await listRepoProjectPaths();
    } catch {
      return;
    }

    for (const projectPath of projectPaths) {
      const pidsDir = devPidsDir(projectPath);
      if (!fs.existsSync(pidsDir)) continue;

      const cfg = readAppDashboardConfig(projectPath);
      for (const server of cfg.servers ?? []) {
        const logPath = path.join(pidsDir, `${server.id}.log`);
        if (!fs.existsSync(logPath)) continue;

        const newContent = readNewContent(logPath);
        if (!newContent) continue;

        const errors = detectErrors(newContent);
        for (const err of errors) {
          await reportBug(projectPath, server.id, err.snippet, err.type);
          detected++;
        }
      }
    }
    _lastScanError = null;
  } catch (e) {
    _lastScanError = e instanceof Error ? e.message : String(e);
  } finally {
    _lastScanAt = new Date();
    _lastScanDurationMs = Date.now() - start;
    _lastScanBugsDetected = detected;
  }
}

// ── API publique ──────────────────────────────────────────────────────────────

/** Démarre le scanner de bugs (idempotent). Appelé depuis le middleware au boot. */
export function startBugDetector() {
  if (_intervalHandle) return;
  // Premier scan différé de 20 s (laisser les serveurs démarrer)
  _initialScanHandle = setTimeout(() => {
    _initialScanHandle = null;
    scanAllProjects().catch(() => undefined);
  }, 20_000);
  _intervalHandle = setInterval(() => {
    scanAllProjects().catch((e) => console.warn('[bug-detector] scan error:', e));
  }, 30_000);
}

/** Arrête le scanner (ex. en test). */
export function stopBugDetector() {
  if (_initialScanHandle) {
    clearTimeout(_initialScanHandle);
    _initialScanHandle = null;
  }
  if (_intervalHandle) {
    clearInterval(_intervalHandle);
    _intervalHandle = null;
  }
}

(import.meta as ImportMeta & { hot?: { dispose: (callback: () => void) => void } }).hot?.dispose(() => {
  stopBugDetector();
});

/** Force un scan immédiat (utilisable depuis le REPL ou les tests). */
export async function forceScan(): Promise<void> {
  await scanAllProjects();
}

/** Statut public du daemon pour le dashboard. */
export function getBugDetectorStatus(): {
  running: boolean;
  intervalMs: number;
  lastScanAt: string | null;
  lastScanDurationMs: number | null;
  lastScanError: string | null;
  lastScanBugsDetected: number;
} {
  return {
    running: _intervalHandle !== null,
    intervalMs: 30_000,
    lastScanAt: _lastScanAt ? _lastScanAt.toISOString() : null,
    lastScanDurationMs: _lastScanDurationMs,
    lastScanError: _lastScanError,
    lastScanBugsDetected: _lastScanBugsDetected,
  };
}

/** Force un scan immédiat avec un résumé pour l'UI/API. */
export async function runBugDetectorNow(): Promise<{
  ok: boolean;
  durationMs: number;
  bugsDetected: number;
  error?: string;
}> {
  const start = Date.now();
  try {
    await scanAllProjects();
    return {
      ok: _lastScanError == null,
      durationMs: Date.now() - start,
      bugsDetected: _lastScanBugsDetected,
      error: _lastScanError ?? undefined,
    };
  } catch (e) {
    return {
      ok: false,
      durationMs: Date.now() - start,
      bugsDetected: 0,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/** Liste les AgentAppIssue récentes pour le dashboard Bug Inspector. */
export async function listRecentAppIssues(limit = 100): Promise<Array<Record<string, unknown>>> {
  try {
    const { db, AgentAppIssue } = await loadAstroDb();
    const rows = await db.select().from(AgentAppIssue);
    return rows
      .sort((a: { id: number }, b: { id: number }) => b.id - a.id)
      .slice(0, Math.max(1, Math.min(500, limit))) as Array<Record<string, unknown>>;
  } catch {
    return [];
  }
}
