import type { APIRoute } from 'astro';

export const GET: APIRoute = async () => {
  const tasks = [
    {
      id: '1',
      name: 'Backup quotidien',
      schedule: '0 2 * * *',
      command: 'curl -X POST https://api.example.com/backup -H "Authorization: Bearer xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"',
      enabled: true,
      lastRun: new Date('2026-08-21T02:00:00Z').toISOString(),
    },
    {
      id: '2',
      name: 'Nettoyage des logs',
      schedule: '0 */6 * * *',
      command: 'find /var/log -name "*.log" -mtime +7 -delete',
      enabled: true,
      lastRun: new Date('2026-08-21T18:00:00Z').toISOString(),
    },
    {
      id: '3',
      name: 'Sync webhook',
      schedule: '*/15 * * * *',
      command: 'node /app/sync.js --token Bearer xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
      enabled: false,
      lastRun: new Date('2026-08-20T15:30:00Z').toISOString(),
    },
  ];

  return new Response(JSON.stringify({ tasks }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
