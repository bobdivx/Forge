import type { APIRoute } from 'astro';

export const GET: APIRoute = async ({ params }) => {
  const { slug } = params;

  if (!slug) {
    return new Response(JSON.stringify({ error: 'Application non trouvée' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const sampleLogs = [
    `[${new Date().toISOString()}] INFO  Starting application ${slug}...`,
    `[${new Date().toISOString()}] INFO  Loading configuration`,
    `[${new Date().toISOString()}] INFO  Database connection established`,
    `[${new Date().toISOString()}] INFO  Server listening on port 3000`,
    `[${new Date().toISOString()}] INFO  Application ready`,
  ];

  return new Response(JSON.stringify({ logs: sampleLogs }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
