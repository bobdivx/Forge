import { db, Heartbeat } from 'astro:db';

export default async function() {
  await db.insert(Heartbeat).values([
    { level: 'error', message: 'gh CLI still not authenticated. Sync disabled.', source: 'CHEF_TECHNIQUE' },
    { level: 'warning', message: 'popcornn-client healthcheck port mismatch (4321 vs 80). Redeploy needed.', source: 'CHEF_TECHNIQUE' },
    { level: 'info', message: 'Maintenance cycle complete. Dashboard stable on 4330.', source: 'CHEF_TECHNIQUE' }
  ]);
  console.log('Maintenance log updated in DB.');
}
