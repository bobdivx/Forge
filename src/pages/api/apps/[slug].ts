import type { APIRoute } from 'astro';

export const GET: APIRoute = async ({ params }) => {
  const { slug } = params;

  if (!slug) {
    return new Response(JSON.stringify({ error: 'Application non trouvée' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const app = {
    id: slug,
    name: slug.replace(/-/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase()),
    status: 'healthy',
    url: `https://${slug}.example.com`,
  };

  return new Response(JSON.stringify(app), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
