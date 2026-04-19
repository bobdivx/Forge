import { sql } from 'drizzle-orm';
import { createClient } from '@astrojs/db/db-client/libsql-node.js';
const db = createClient({ url: 'file:///x:/AppData/forge/astro/content.db' });
await db.execute('ALTER TABLE Project ADD COLUMN swarmEnabled INTEGER DEFAULT 0;');
console.log('Patch success!');
