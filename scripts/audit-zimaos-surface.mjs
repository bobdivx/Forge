#!/usr/bin/env node
/**
 * Audit des références ZimaOS dans src/ (CI ou dev).
 * L’usage principal pour les humains est l’interface : Paramètres → ZIMAOS → analyse intégrée.
 * Usage : node scripts/audit-zimaos-surface.mjs [--json]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');

const PATTERNS = [
  { name: 'import zimaos-gateway', re: /from\s+['"][^'"]*zimaos-gateway['"]/ },
  { name: 'import zimaos-openai-surface', re: /from\s+['"][^'"]*zimaos-openai-surface['"]/ },
  { name: 'import discussion-zimaos', re: /from\s+['"][^'"]*discussion-zimaos-session['"]/ },
  { name: 'ZIMAOS_GATEWAY', re: /ZIMAOS_GATEWAY|zimaosGatewayUrl|zimaosRuntimeUrl/ },
  { name: 'fetch api zimaos', re: /fetch\([^)]*\/api\/zimaos/ },
];

const EXT = /\.(ts|tsx|astro|mjs)$/;

function walk(dir, acc = []) {
  let entries = [];
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

function scan() {
  const files = walk(SRC);
  const out = [];
  let hitCount = 0;
  const byPattern = {};

  for (const abs of files) {
    const text = fs.readFileSync(abs, 'utf8');
    const lines = text.split(/\r?\n/);
    const hits = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const { name, re } of PATTERNS) {
        if (re.test(line)) {
          hits.push({ pattern: name, line: i + 1, text: line.trim().slice(0, 160) });
          hitCount += 1;
          byPattern[name] = (byPattern[name] ?? 0) + 1;
        }
      }
    }
    if (hits.length) {
      out.push({
        path: path.relative(SRC, abs).replace(/\\/g, '/'),
        hits,
      });
    }
  }
  out.sort((a, b) => a.path.localeCompare(b.path));
  return {
    summary: {
      srcFilesScanned: files.length,
      filesWithHits: out.length,
      hitCount,
      byPattern,
    },
    files: out,
    componentsWithGatewayImport: out.filter(
      (f) =>
        f.path.includes('components/') &&
        f.hits.some((h) => h.pattern === 'import zimaos-gateway'),
    ),
  };
}

const json = process.argv.includes('--json');
const data = scan();

if (json) {
  process.stdout.write(JSON.stringify(data, null, 2) + '\n');
  process.exit(0);
}

console.log('\n=== Audit surface ZimaOS (Forge) ===\n');
console.log('Contrat : ZimaOS = runtime NAS / gateway uniquement ; Forge = persistance & UI.\n');
console.log('Résumé :');
console.log(`  Fichiers src scannés : ${data.summary.srcFilesScanned}`);
console.log(`  Fichiers avec occurrences : ${data.summary.filesWithHits}`);
console.log(`  Occurrences totales : ${data.summary.hitCount}`);
console.log('  Par motif :', data.summary.byPattern);
if (data.componentsWithGatewayImport?.length) {
  console.log('\n⚠ À revoir : composants qui importent zimaos-gateway :');
  for (const f of data.componentsWithGatewayImport) {
    console.log('   -', f.path);
  }
} else {
  console.log('\n✓ Aucun composant sous components/ n’importe directement zimaos-gateway.');
}
console.log('\nDétail :', data.files.length, 'fichiers listés (voir --json pour tout export).\n');
process.exit(0);
