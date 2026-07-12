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

    if (!containerId) {
      return new Response(JSON.stringify({ error: "ID du conteneur manquant" }), { 
        status: 400, 
        headers: { 'Content-Type': 'application/json' } 
      });
    }

    // 🛡️ SECURITY: Prevent flag injection and command injection
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

    // 🛡️ SECURITY: Use execFileAsync with argument arrays instead of exec/execSync
    let logs: string[] = [];
    try {
        const { stdout, stderr } = await execFileAsync('docker', ['logs', '--tail', tail, containerId], { maxBuffer: 10 * 1024 * 1024 });
        // Combine stdout and stderr
        logs = (stdout + stderr).trim().split('\n');
    } catch (err: any) {
        // Certains logs sortent sur stderr, checkons stderr si erreur
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
