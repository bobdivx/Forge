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

    if (!containerId || typeof containerId !== 'string') {
      return new Response(JSON.stringify({ error: "ID du conteneur manquant ou invalide" }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (!/^[a-zA-Z0-9_.-]+$/.test(containerId) || containerId.startsWith('-')) {
      return new Response(JSON.stringify({ error: "ID du conteneur invalide" }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (!/^\d+$/.test(tail)) {
      return new Response(JSON.stringify({ error: "Paramètre tail invalide" }), {
        status: 400, 
        headers: { 'Content-Type': 'application/json' } 
      });
    }

    // Commande Docker pour récupérer les logs
    let logs: string[] = [];
    try {
        const { stdout, stderr } = await execFileAsync('docker', ['logs', '--tail', tail, containerId]);
        // Combinaison des deux flux au cas où
        logs = (stdout + stderr).trim().split('\n');
    } catch (err: any) {
        // execFileAsync throws on non-zero exit code
        if (err.stdout || err.stderr) {
            logs = ((err.stdout || '') + (err.stderr || '')).toString().trim().split('\n');
        } else {
            throw err;
        }
    }

    return new Response(JSON.stringify({ logs: logs.filter(l => l.trim() !== '') }), {
      status: 200, 
      headers: { 'Content-Type': 'application/json' } 
    });
  } catch (error: any) {
    console.error('Docker logs error:', error);
    return new Response(JSON.stringify({ error: "Logs indisponibles" }), {
      status: 500, 
      headers: { 'Content-Type': 'application/json' } 
    });
  }
};
