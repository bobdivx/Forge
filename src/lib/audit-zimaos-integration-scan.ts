/**
 * Analyse statique légère : repère les imports / mentions ZimaOS dans `src/`.
 * Utilisé par `GET /api/zimaos-integration-audit` (Paramètres → ZIMAOS) et par `npm run audit:zimaos`.
 */
import fs from 'node:fs';
import path from 'node:path';

export type ZimaOSScanHit = { pattern: string; line: number; text: string };
export type ZimaOSScanFile = { file: string; rel: string; hits: ZimaOSScanHit[] };

const PATTERNS: { name: string; re: RegExp }[] = [
  { name: 'import zimaos-gateway', re: /from\s+['"][^'"]*zimaos-gateway['"]/ },
  { name: 'import zimaos-openai-surface', re: /from\s+['"][^'"]*zimaos-openai-surface['"]/ },
  { name: 'import discussion-zimaos', re: /from\s+['"][^'"]*discussion-zimaos-session['"]/ },
  { name: 'import zimaos-agent-provision', re: /from\s+['"][^'"]*zimaos-agent-provision['"]/ },
  { name: 'import zimaos-auto-repair', re: /from\s+['"][^'"]*zimaos-auto-repair['"]/ },
  { name: 'import zimaos-infra', re: /from\s+['"][^'"]*zimaos-infra-client['"]/ },
  { name: 'ZIMAOS_GATEWAY', re: /ZIMAOS_GATEWAY|zimaosGatewayUrl|zimaosRuntimeUrl/ },
  { name: 'api route zimaos', re: /\/api\/zimaos[-/]/ },
];

const EXT = /\.(ts|tsx|astro|mjs)$/;

function walk(dir: string, acc: string[] = []): string[] {
  let entries: fs.Dirent[] = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === 'dist' || e.name === '.git') continue;
      walk(p, acc);
    } else if (EXT.test(e.name)) acc.push(p);
  }
  return acc;
}

function scanFile(absPath: string, srcRoot: string): ZimaOSScanFile | null {
  let text = '';
  try {
    text = fs.readFileSync(absPath, 'utf8');
  } catch {
    return null;
  }
  const lines = text.split(/\r?\n/);
  const hits: ZimaOSScanHit[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const { name, re } of PATTERNS) {
      if (re.test(line)) {
        hits.push({ pattern: name, line: i + 1, text: line.trim().slice(0, 200) });
      }
    }
  }
  if (!hits.length) return null;
  return {
    file: absPath,
    rel: path.relative(srcRoot, absPath).replace(/\\/g, '/'),
    hits,
  };
}

export function runZimaosIntegrationScan(srcRoot: string): {
  files: ZimaOSScanFile[];
  summary: { totalFiles: number; filesWithHits: number; hitCount: number; byPattern: Record<string, number> };
} {
  const allFiles = walk(srcRoot);
  const files: ZimaOSScanFile[] = [];
  const byPattern: Record<string, number> = {};
  let hitCount = 0;

  for (const f of allFiles) {
    const r = scanFile(f, srcRoot);
    if (!r) continue;
    files.push(r);
    for (const h of r.hits) {
      hitCount += 1;
      byPattern[h.pattern] = (byPattern[h.pattern] ?? 0) + 1;
    }
  }

  files.sort((a, b) => a.rel.localeCompare(b.rel));

  return {
    files,
    summary: {
      totalFiles: allFiles.length,
      filesWithHits: files.length,
      hitCount,
      byPattern,
    },
  };
}
