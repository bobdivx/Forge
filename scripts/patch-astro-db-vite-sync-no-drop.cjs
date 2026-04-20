"use strict";

/**
 * @astrojs/db : le plugin Vite appelle `recreateTables()` à chaque reload du module
 * virtuel `astro:db` (dont après HMR / modif de fichier). Cette fonction faisait
 * `DROP TABLE` + `CREATE` pour **toutes** les tables → table ForgeUser vidée,
 * session invalide, message « Aucun compte en base ».
 *
 * Remplacement par une sync « CREATE IF NOT EXISTS » / index « IF NOT EXISTS »,
 * alignée sur `scripts/forge-sync-local-db.mjs`. Idempotent.
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const target = path.join(
  root,
  "node_modules",
  "@astrojs",
  "db",
  "dist",
  "core",
  "integration",
  "vite-plugin-db.js"
);

const marker = "FORGE_PATCH_AstroDbViteSyncNoDrop";

if (!fs.existsSync(target)) {
  process.exit(0);
}

const cur = fs.readFileSync(target, "utf8");
if (cur.includes(marker)) {
  process.exit(0);
}

const needle = `async function recreateTables({ tables, root }) {
  const { ASTRO_DATABASE_FILE } = getAstroEnv();
  const dbUrl = normalizeDatabaseUrl(ASTRO_DATABASE_FILE, new URL(DB_PATH, root).href);
  const db = createClient({ url: dbUrl });
  const setupQueries = [];
  for (const [name, table] of Object.entries(tables.get() ?? {})) {
    const dropQuery = sql.raw(\`DROP TABLE IF EXISTS \${sqlite.escapeName(name)}\`);
    const createQuery = sql.raw(getCreateTableQuery(name, table));
    const indexQueries = getCreateIndexQueries(name, table);
    setupQueries.push(dropQuery, createQuery, ...indexQueries.map((s) => sql.raw(s)));
  }
  await db.batch([
    db.run(sql\`pragma defer_foreign_keys=true;\`),
    ...setupQueries.map((q) => db.run(q))
  ]);
}`;

if (!cur.includes(needle)) {
  console.warn(
    "[forge] patch-astro-db-vite-sync-no-drop : motif recreateTables introuvable (version @astrojs/db différente ?). Aucun changement."
  );
  process.exit(0);
}

const replacement = `async function recreateTables({ tables, root }) {
  /* ${marker} : pas de DROP sur reload HMR — évite d'effacer ForgeUser et les données locales */
  const { ASTRO_DATABASE_FILE } = getAstroEnv();
  const dbUrl = normalizeDatabaseUrl(ASTRO_DATABASE_FILE, new URL(DB_PATH, root).href);
  const db = createClient({ url: dbUrl });
  const setupQueries = [];
  for (const [name, table] of Object.entries(tables.get() ?? {})) {
    const createQ = getCreateTableQuery(name, table).replace(/^CREATE TABLE/i, "CREATE TABLE IF NOT EXISTS");
    setupQueries.push(sql.raw(createQ));
    for (const idx of getCreateIndexQueries(name, table)) {
      const idxQ = idx.replace(/^CREATE\\s+(UNIQUE\\s+)?INDEX/i, (m) => m + " IF NOT EXISTS");
      setupQueries.push(sql.raw(idxQ));
    }
  }
  await db.batch([
    db.run(sql\`pragma defer_foreign_keys=true;\`),
    ...setupQueries.map((q) => db.run(q))
  ]);
}`;

fs.writeFileSync(target, cur.replace(needle, replacement), "utf8");
console.log("[forge] Patch @astrojs/db vite-plugin-db.js (sync IF NOT EXISTS, sans DROP au reload)");
