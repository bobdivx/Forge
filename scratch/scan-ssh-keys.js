import { loadAstroDb } from '../src/lib/load-astro-db.ts';

async function test() {
  const { db } = await loadAstroDb();
  console.log('Scanning all tables for potential SSH keys...');
  
  // This is a bit hacky because Astro DB doesn't expose metadata easily
  // but we know the tables from db/config.ts
  const tables = [
    'Project', 'AppData', 'Config', 'ForgeUser', 'AgentInstruction', 
    'AgentModel', 'CustomApiToken', 'AgentBudget', 'ZimaOSAgentProfile', 
    'OllamaInstance'
  ];

  for (const tableName of tables) {
    try {
      // @ts-ignore
      const rows = await db.select().from(db._tables[tableName]);
      for (const row of rows) {
        const str = JSON.stringify(row);
        if (str.includes('BEGIN OPENSSH PRIVATE KEY') || str.includes('BEGIN RSA PRIVATE KEY')) {
          console.log(`Found potential SSH key in table: ${tableName}`);
          console.log('Row ID/Key:', row.id || row.key || 'N/A');
          // Don't log the full key for security
        }
      }
    } catch (e) {
      // Table might not exist or be accessible this way
    }
  }
}
test();
