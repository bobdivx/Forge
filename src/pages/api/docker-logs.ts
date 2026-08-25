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
    const tail = url.searchParams.get('tail') || '100';

    if (!containerId) {
      return new Response(JSON.stringify({ error: "ID du conteneur manquant" }), { 
        status: 400, 
        headers: { 'Content-Type': 'application/json' } 
      });
    }

    // 🔒 Security: Validate containerId strictly to prevent argument injection
    if (!/^[a-zA-Z0-9_.-]+$/.test(containerId) || containerId.startsWith('-')) {
      return new Response(JSON.stringify({ error: "ID du conteneur invalide" }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 🔒 Security: Validate tail parameter strictly
    if (!/^\d+$/.test(tail) && tail !== 'all') {
       return new Response(JSON.stringify({ error: "Paramètre tail invalide" }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    let logs = [];
    try {
        // 🔒 Security: Use execFileSync with argument array instead of execSync with shell parsing
        const output = execFileSync('docker', ['logs', '--tail', tail, containerId], { stdio: ['pipe', 'pipe', 'pipe'] }).toString();
        logs = output.trim().split('\n');
    } catch (err: any) {
        // 🔒 Security: Do NOT leak err.stderr or raw errors
        throw new Error('Docker logs exec failed');
    }

    return new Response(JSON.stringify({ logs }), { 
      status: 200, 
      headers: { 'Content-Type': 'application/json' } 
    });
  } catch (error: any) {
    // 🔒 Security: Return a purely generic error message to avoid information disclosure
    return new Response(JSON.stringify({ error: "Logs indisponibles" }), {
      status: 500, 
      headers: { 'Content-Type': 'application/json' } 
    });
  }
};
