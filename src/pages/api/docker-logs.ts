import type { APIRoute } from 'astro';
import { execFile } from 'child_process';
import util from 'util';

const execFileAsync = util.promisify(execFile);

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

    if (!containerId || containerId.startsWith('-')) {
      return new Response(JSON.stringify({ error: "ID du conteneur invalide ou manquant" }), {
        status: 400, 
        headers: { 'Content-Type': 'application/json' } 
      });
    }

    // 🛡️ Security: Use execFile to prevent command injection, and -- to prevent flag injection.
    let logs: string[] = [];
    try {
        const { stdout, stderr } = await execFileAsync('docker', [
            'logs',
            '--tail',
            tail,
            '--',
            containerId
        ]);

        // Certains logs sortent sur stderr, fusionnons ou utilisons stdout
        const output = stdout.trim() || stderr.trim();
        logs = output ? output.split('\n') : [];
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
    // 🛡️ Security: Sanitize error message to avoid leaking internals
    const sanitizedMsg = error.message ? error.message.split('\n')[0] : "Erreur inconnue";
    return new Response(JSON.stringify({ error: "Logs indisponibles: " + sanitizedMsg }), {
      status: 500, 
      headers: { 'Content-Type': 'application/json' } 
    });
  }
};
