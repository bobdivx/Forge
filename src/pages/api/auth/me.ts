import type { APIRoute } from 'astro';

export const GET: APIRoute = async ({ locals }) => {
  const email = (locals as any)?.user?.email ?? '';
  return new Response(JSON.stringify({ email }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
};
