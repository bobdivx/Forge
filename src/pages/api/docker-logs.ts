import type { APIRoute } from 'astro';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export const GET: APIRoute = async ({ url }) => {
  try {
    const isVercel = !!process.env.VERCEL || !!process.env.VERCEL_ENV;
    if (isVercel) {
      return new Response(JSON.stringify({ logs: ["Docker logs non disponibles sur Vercel"] }), { 
        status: 200, 
        headers: { 'Content-Type': 'application/json' } 
      });
    }

    const containerId = url.searchParams.get('id');
    const tail = url.searchParams.get('tail') || '100';

    if (!containerId || !/^[a-zA-Z0-9_.-]+$/.test(containerId) || containerId.startsWith('-')) {
      return new Response(JSON.stringify({ error: "ID du conteneur invalide ou manquant" }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (!/^\d+$/.test(tail) && tail !== 'all') {
       return new Response(JSON.stringify({ error: "Paramètre 'tail' invalide" }), {
        status: 400, 
        headers: { 'Content-Type': 'application/json' } 
      });
    }

    let logs: string[] = [];
    try {
        const { stdout, stderr } = await execFileAsync('docker', ['logs', '--tail', tail, '--', containerId]);
        logs = (stdout || stderr).trim().split('\n');
    } catch (err: any) {
        if (err.stderr) {
            logs = err.stderr.toString().trim().split('\n');
        } else {
            throw err;
        }
    }

    return new Response(JSON.stringify({ logs }), { 
      status: 200, 
      headers: { 'Content-Type': 'application/json' } 
    });
  } catch (error: any) {
    // Sanitize error message to prevent leaking sensitive information
    return new Response(JSON.stringify({ error: "Logs indisponibles: Une erreur inattendue s'est produite." }), {
      status: 500, 
      headers: { 'Content-Type': 'application/json' } 
    });
  }
};
