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
    const tailParam = url.searchParams.get('tail') || '100';

    // 🛡️ Security: Validate input and prevent flag injection
    if (!containerId || containerId.startsWith('-')) {
      return new Response(JSON.stringify({ error: "ID du conteneur invalide ou manquant" }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const tail = parseInt(tailParam, 10);
    if (isNaN(tail)) {
      return new Response(JSON.stringify({ error: "Paramètre tail invalide" }), {
        status: 400, 
        headers: { 'Content-Type': 'application/json' } 
      });
    }

    // 🛡️ Security: Use execFile to prevent command injection
    let logs: string[] = [];
    try {
        const { stdout, stderr } = await execFileAsync('docker', ['logs', '--tail', tail.toString(), '--', containerId]);
        const output = stdout.trim() || stderr.trim();
        logs = output ? output.split('\n') : [];
    } catch (err: any) {
        // Certains logs sortent sur stderr, checkons stderr si stdout est vide ou si erreur
        if (err.stderr) {
            logs = err.stderr.toString().trim().split('\n');
        } else {
            throw new Error("Execution failed");
        }
    }

    return new Response(JSON.stringify({ logs }), { 
      status: 200, 
      headers: { 'Content-Type': 'application/json' } 
    });
  } catch (error: any) {
    // 🛡️ Security: Sanitize error message to prevent leaking system details
    return new Response(JSON.stringify({ error: "Logs indisponibles" }), {
      status: 500, 
      headers: { 'Content-Type': 'application/json' } 
    });
  }
};
