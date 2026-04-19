/**
 * Synchronise les tables Astro DB sur un fichier SQLite local (CREATE IF NOT EXISTS).
 * Permet d'ajouter de nouvelles tables sur la DB persistante d'un volume Docker.
 */
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { sql } from 'drizzle-orm';
import { SQLiteAsyncDialect } from 'drizzle-orm/sqlite-core';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dbHref = process.argv[2]?.trim();
if (!dbHref?.startsWith('file:')) {
  console.error('[forge-sync-local-db] Usage: node scripts/forge-sync-local-db.mjs <file:///app/.astro/content.db>');
  process.exit(1);
}

const pkgRoot = join(root, 'node_modules', '@astrojs', 'db');
const queriesHref = pathToFileURL(join(pkgRoot, 'dist', 'core', 'queries.js')).href;
const loadFileHref = pathToFileURL(join(pkgRoot, 'dist', 'core', 'load-file.js')).href;

if (!existsSync(join(pkgRoot, 'dist', 'core', 'queries.js'))) {
  console.error('[forge-sync-local-db] @astrojs/db introuvable sous', pkgRoot);
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
  const createQ = getCreateTableQuery(name, table).replace(/^CREATE TABLE/i, 'CREATE TABLE IF NOT EXISTS');
  setupQueries.push(sql.raw(createQ));
  for (const idx of getCreateIndexQueries(name, table)) {
    const idxQ = idx.replace(/^CREATE\s+(UNIQUE\s+)?INDEX/i, (m) => m + ' IF NOT EXISTS');
    setupQueries.push(sql.raw(idxQ));
  }
}
await db.batch([db.run(sql`pragma defer_foreign_keys=true;`), ...setupQueries.map((q) => db.run(q))]);
console.log('[forge-sync-local-db] Schéma synchronisé (IF NOT EXISTS) sur', dbHref);
