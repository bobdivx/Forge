import { performZimaOSAgentsSync } from '../src/pages/api/zimaos-sync-agents.ts';

export default async function () {
  console.log('Starting ZimaOS agents sync...');
  try {
    const result = await performZimaOSAgentsSync();
    console.log('Sync result:', JSON.stringify(result, null, 2));
  } catch (e) {
    console.error('Sync failed:', e);
  }
}
