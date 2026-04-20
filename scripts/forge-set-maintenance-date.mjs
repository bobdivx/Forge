import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dbHref = process.argv[2]?.trim() || 'file:///mnt/GitHub/Forge/.astro/db.sqlite';

const pkgRoot = join(root, 'node_modules', '@astrojs', 'db');
const { createClient } = await import('@astrojs/db/db-client/libsql-node.js');
const db = createClient({ url: dbHref });

const now = new Date().toISOString();

try {
  // On utilise INSERT OR REPLACE (SQLite) pour la clé primaire 'key'
  await db.run(sql.raw(`INSERT OR REPLACE INTO Config ("key", "value", "updatedAt") VALUES ('lastMaintenanceCycle', '${now}', '${now}')`));
  console.log('[forge-maintenance] Date de maintenance mise à jour:', now);
} catch (e) {
  console.error('[forge-maintenance] Erreur lors de la mise à jour de la config:', e);
  process.exit(1);
}
