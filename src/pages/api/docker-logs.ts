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
    let tailParam = url.searchParams.get('tail') || '100';

    if (!containerId) {
      return new Response(JSON.stringify({ error: "ID du conteneur manquant" }), { 
        status: 400, 
        headers: { 'Content-Type': 'application/json' } 
      });
    }

    // Input validation: prevent command injection and flag injection
    if (typeof containerId !== 'string' || !/^[a-zA-Z0-9_.-]+$/.test(containerId) || containerId.startsWith('-')) {
      return new Response(JSON.stringify({ error: "ID du conteneur invalide" }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const tailNum = parseInt(tailParam, 10);
    if (isNaN(tailNum) || tailNum < 0) {
      tailParam = '100'; // Default fallback if invalid
    } else {
      tailParam = tailNum.toString();
    }

    let logs: string[] = [];
    try {
        // Use execFileSync with array arguments to prevent command injection
        const output = execFileSync('docker', ['logs', '--tail', tailParam, containerId], {
          stdio: ['pipe', 'pipe', 'pipe'],
          encoding: 'utf-8'
        });
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
    return new Response(JSON.stringify({ error: "Logs indisponibles: " + error.message }), { 
      status: 500, 
      headers: { 'Content-Type': 'application/json' } 
    });
  }
};
