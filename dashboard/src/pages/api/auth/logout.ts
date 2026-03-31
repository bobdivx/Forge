import type { APIRoute } from 'astro';

export const POST: APIRoute = async ({ cookies }) => {
  cookies.delete('forge_session', { path: '/' });
  return new Response(JSON.stringify({ status: 'ok' }), { status: 200 });
};

export const GET: APIRoute = async ({ cookies, redirect }) => {
  cookies.delete('forge_session', { path: '/' });
  return redirect('/login');
};
