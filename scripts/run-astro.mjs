/**
 * Lance le CLI Astro avec ASTRO_DATABASE_FILE défini si absent (build / preview / dev).
 * Évite l’erreur @astrojs/db : « pass --remote or ASTRO_DATABASE_FILE » hors Docker.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("Usage: node scripts/run-astro.mjs <dev|build|preview|…> [args…]");
  process.exit(1);
}

/**
 * libSQL refuse les chemins Windows bruts (Y:\\…) : « got y: » — il faut une URL file:.
 * @param {string} raw
 */
function toLibsqlDatabaseUrl(raw) {
  const t = (raw || "").trim();
  if (!t) return t;
  if (/^(libsql|https?|wss?|file):/i.test(t)) return t;
  try {
    return pathToFileURL(path.normalize(t)).href;
  } catch {
    return t;
  }
}

if (!process.env.ASTRO_DATABASE_FILE) {
  const canonicalDbFile = path.join(root, ".astro", "content.db");
  fs.mkdirSync(path.dirname(canonicalDbFile), { recursive: true });
  // Base locale unique: aucune dependance legacy.
  process.env.ASTRO_DATABASE_FILE = pathToFileURL(canonicalDbFile).href;
} else {
  process.env.ASTRO_DATABASE_FILE = toLibsqlDatabaseUrl(
    process.env.ASTRO_DATABASE_FILE
  );
}

// Stabilise les exécutions CI/agents : évite les invites interactives bloquantes.
if (!process.env.CI) process.env.CI = "1";
if (!process.env.ASTRO_TELEMETRY_DISABLED) process.env.ASTRO_TELEMETRY_DISABLED = "1";

const astro = path.join(root, "node_modules", "astro", "bin", "astro.mjs");
const r = spawnSync(process.execPath, [astro, ...args], {
  cwd: root,
  stdio: "inherit",
  env: process.env,
});
process.exit(r.status === null ? 1 : r.status);
