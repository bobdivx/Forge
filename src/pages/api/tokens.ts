import type { APIRoute } from 'astro';

export const GET: APIRoute = async () => {
  const tokens = [
    {
      id: '1',
      name: 'API Token Principal',
      createdAt: new Date('2026-01-15').toISOString(),
      lastUsed: new Date('2026-08-20').toISOString(),
    },
    {
      id: '2',
      name: 'Webhook GitHub',
      createdAt: new Date('2026-02-10').toISOString(),
      lastUsed: new Date('2026-08-21').toISOString(),
    },
  ];

  return new Response(JSON.stringify({ tokens }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
