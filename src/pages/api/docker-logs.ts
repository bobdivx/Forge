import type { APIRoute } from 'astro';
import { execFileSync } from 'child_process';

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
    const tailStr = url.searchParams.get('tail') || '100';

    if (!containerId || containerId.startsWith('-') || !/^[a-zA-Z0-9_-]+$/.test(containerId)) {
      return new Response(JSON.stringify({ error: "ID du conteneur invalide ou manquant" }), {
        status: 400, 
        headers: { 'Content-Type': 'application/json' } 
      });
    }

    // Validation stricte du tail
    const tail = parseInt(tailStr, 10);
    if (isNaN(tail) || tail <= 0 || tail > 10000) {
      return new Response(JSON.stringify({ error: "Paramètre tail invalide" }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 🛡️ Sentinel: Use execFileSync with array arguments to prevent command injection
    let logs: string[] = [];
    try {
        const output = execFileSync('docker', ['logs', '--tail', tail.toString(), containerId], { stdio: ['pipe', 'pipe', 'pipe'] }).toString();
        logs = output.trim().split('\n');
    } catch (err: any) {
        // Certains logs sortent sur stderr, checkons stderr si stdout est vide ou si erreur
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
    // 🛡️ Sentinel: Sanitize error response to avoid leaking internal details
    return new Response(JSON.stringify({ error: "Logs indisponibles" }), {
      status: 500, 
      headers: { 'Content-Type': 'application/json' } 
    });
  }
};
