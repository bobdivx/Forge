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

    if (!containerId || !/^[a-zA-Z0-9_.-]+$/.test(containerId)) {
      return new Response(JSON.stringify({ error: "ID du conteneur invalide ou manquant" }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (!/^[0-9]+$/.test(tail) && tail !== 'all') {
      return new Response(JSON.stringify({ error: "Paramètre tail invalide" }), {
        status: 400, 
        headers: { 'Content-Type': 'application/json' } 
      });
    }

    // Commande Docker pour récupérer les logs
    let logs = [];
    try {
        const { stdout, stderr } = await execFileAsync('docker', ['logs', '--tail', tail, containerId]);
        // Certains logs sortent sur stderr, on combine
        logs = (stdout + '\n' + stderr).trim().split('\n').filter(Boolean);
    } catch (err: any) {
        if (err.stderr) {
            logs = (err.stdout?.toString() || '' + '\n' + err.stderr.toString()).trim().split('\n').filter(Boolean);
        } else {
            throw new Error("Erreur exécution Docker");
        }
    }

    return new Response(JSON.stringify({ logs }), { 
      status: 200, 
      headers: { 'Content-Type': 'application/json' } 
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: "Logs indisponibles" }), {
      status: 500, 
      headers: { 'Content-Type': 'application/json' } 
    });
  }
};
