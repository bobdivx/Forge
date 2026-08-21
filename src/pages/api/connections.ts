import type { APIRoute } from 'astro';

export const GET: APIRoute = async () => {
  const connections = [
    {
      id: '1',
      name: 'GitHub',
      type: 'github',
      status: 'connected',
    },
    {
      id: '2',
      name: 'Docker Hub',
      type: 'docker',
      status: 'connected',
    },
  ];

  return new Response(JSON.stringify({ connections }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
