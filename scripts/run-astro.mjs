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
  const preferredDbFile = path.join(root, ".astro", "content.db");
  const legacyDbFile = path.join(root, ".astro", "db.sqlite");
  fs.mkdirSync(path.dirname(preferredDbFile), { recursive: true });
  // Migration locale de compat: certains scripts plus anciens utilisaient db.sqlite.
  // On bascule vers content.db (même valeur que Dockerfile/forge.yml) pour éviter
  // de "perdre" les comptes entre deux commandes (dev/build/preview).
  if (!fs.existsSync(preferredDbFile) && fs.existsSync(legacyDbFile)) {
    try {
      fs.copyFileSync(legacyDbFile, preferredDbFile);
    } catch {
      // best effort: on laisse Astro créer le fichier cible si copie impossible
    }
  }
  process.env.ASTRO_DATABASE_FILE = pathToFileURL(preferredDbFile).href;
} else {
  process.env.ASTRO_DATABASE_FILE = toLibsqlDatabaseUrl(
    process.env.ASTRO_DATABASE_FILE
  );
}

const astro = path.join(root, "node_modules", "astro", "bin", "astro.mjs");
const r = spawnSync(process.execPath, [astro, ...args], {
  cwd: root,
  stdio: "inherit",
  env: process.env,
});
process.exit(r.status === null ? 1 : r.status);
