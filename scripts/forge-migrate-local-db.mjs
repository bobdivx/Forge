/**
 * Migrations additives sur le fichier SQLite Forge (volume NAS persistant).
 * Quand le fichier est plus ancien que le schéma du code, Drizzle échoue avec
 * « no such column » — on ajoute les colonnes manquantes sans DROP des données.
 */
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dbHref = process.argv[2]?.trim();
if (!dbHref?.startsWith('file:')) {
  console.error('[forge-migrate-local-db] Usage: node scripts/forge-migrate-local-db.mjs <file:///path/content.db>');
  process.exit(1);
}

const pkgRoot = join(root, 'node_modules', '@astrojs', 'db');
if (!existsSync(join(pkgRoot, 'dist', 'core', 'db-client', 'libsql-node.js'))) {
  console.error('[forge-migrate-local-db] @astrojs/db introuvable sous', pkgRoot);
  process.exit(1);
}

const { createClient } = await import('@astrojs/db/db-client/libsql-node.js');
const db = createClient({ url: dbHref });

const STATEMENTS = [
  'ALTER TABLE Project ADD COLUMN swarmEnabled INTEGER NOT NULL DEFAULT 1',
];

for (const raw of STATEMENTS) {
  try {
    await db.run(sql.raw(raw));
    console.log('[forge-migrate-local-db] OK:', raw);
  } catch (e) {
    const msg = String(e?.message ?? e);
    if (/duplicate column name/i.test(msg) || /already exists/i.test(msg)) {
      console.log('[forge-migrate-local-db] ignoré (colonne déjà présente):', raw.split(' ADD ')[1] ?? raw);
    } else if (/no such table/i.test(msg)) {
      console.log('[forge-migrate-local-db] ignoré (aucune table Project encore — bootstrap recréera le schéma)');
    } else {
      console.error('[forge-migrate-local-db] échec:', raw, e);
      throw e;
    }
  }
}

console.log('[forge-migrate-local-db] Terminé pour', dbHref);
