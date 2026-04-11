/**
 * Recrée les tables Astro DB sur un fichier SQLite local (DROP + CREATE depuis `db/config.ts`).
 * Exécuté par Node en dehors du bundle Vite : imports internes `@astrojs/db/dist/...` autorisés.
 */
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { sql } from 'drizzle-orm';
import { SQLiteAsyncDialect } from 'drizzle-orm/sqlite-core';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dbHref = process.argv[2]?.trim();
if (!dbHref?.startsWith('file:')) {
  console.error('[forge-recreate-local-db] Usage: node scripts/forge-recreate-local-db.mjs <file:///app/.astro/content.db>');
  process.exit(1);
}

const pkgRoot = join(root, 'node_modules', '@astrojs', 'db');
const queriesHref = pathToFileURL(join(pkgRoot, 'dist', 'core', 'queries.js')).href;
const loadFileHref = pathToFileURL(join(pkgRoot, 'dist', 'core', 'load-file.js')).href;

if (!existsSync(join(pkgRoot, 'dist', 'core', 'queries.js'))) {
  console.error('[forge-recreate-local-db] @astrojs/db introuvable sous', pkgRoot);
  process.exit(1);
}

const { createClient } = await import('@astrojs/db/db-client/libsql-node.js');
const { getCreateTableQuery, getCreateIndexQueries } = await import(queriesHref);
const { resolveDbConfig } = await import(loadFileHref);

const sqlite = new SQLiteAsyncDialect();
const projectRoot = new URL('.', pathToFileURL(join(root, 'package.json')));

const { dbConfig } = await resolveDbConfig({ root: projectRoot, integrations: [] });
const tables = dbConfig.tables ?? {};
const db = createClient({ url: dbHref });
const setupQueries = [];
for (const [name, table] of Object.entries(tables)) {
  setupQueries.push(sql.raw(`DROP TABLE IF EXISTS ${sqlite.escapeName(name)}`));
  setupQueries.push(sql.raw(getCreateTableQuery(name, table)));
  for (const idx of getCreateIndexQueries(name, table)) {
    setupQueries.push(sql.raw(idx));
  }
}
await db.batch([db.run(sql`pragma defer_foreign_keys=true;`), ...setupQueries.map((q) => db.run(q))]);
console.log('[forge-recreate-local-db] Schéma appliqué sur', dbHref);
