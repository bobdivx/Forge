import type { APIRoute } from 'astro';
export const GET: APIRoute = async () => {
  return new Response(JSON.stringify([
    { name: 'CHEF_TECHNIQUE', status: 'actif', cpu: 12 },
    { name: 'ARCHITECTE_LOGICIEL', status: 'en veille', cpu: 0 },
    { name: 'TESTEUR_QA', status: 'actif', cpu: 45 },
    { name: 'DEV_FRONTEND', status: 'actif', cpu: 80 }
  ]), { status: 200, headers: { 'Content-Type': 'application/json' } });
};
