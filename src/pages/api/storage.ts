import type { APIRoute } from 'astro';

export const GET: APIRoute = async () => {
  const disks = [
    {
      id: '1',
      name: 'Racine (CasaOS)',
      path: '/',
      used: 500,
      total: 500,
      percentage: 100,
    },
    {
      id: '2',
      name: 'Docker',
      path: '/media/Docker',
      used: 150,
      total: 1000,
      percentage: 15,
    },
  ];

  return new Response(JSON.stringify({ disks }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
