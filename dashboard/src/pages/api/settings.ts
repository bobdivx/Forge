import type { APIRoute } from 'astro';
import { readAppSettings, writeAppSettings } from '../../lib/auth';

export const GET: APIRoute = async ({ locals }) => {
  try {
    const email = locals.user?.email;
    const settings = readAppSettings(email);
    return new Response(JSON.stringify(settings), {
      status: 200, 
      headers: { 'Content-Type': 'application/json' } 
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: "Impossible de lire la config" }), { status: 500 });
  }
};

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const email = locals.user?.email;
    const data = await request.json();
    const payload = {
      githubToken: String(data?.githubToken ?? ''),
      vercelToken: String(data?.vercelToken ?? ''),
      openclawToken: String(data?.openclawToken ?? '')
    };
    writeAppSettings(payload, email);
    
    return new Response(JSON.stringify({ status: 'success' }), { status: 200 });
  } catch (error) {
    return new Response(JSON.stringify({ error: "Échec de sauvegarde" }), { status: 500 });
  }
};
