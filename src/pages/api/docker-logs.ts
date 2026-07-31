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
    const tailRaw = url.searchParams.get('tail') || '100';

    if (!containerId || containerId.startsWith('-')) {
      return new Response(JSON.stringify({ error: "ID du conteneur manquant ou invalide" }), {
        status: 400, 
        headers: { 'Content-Type': 'application/json' } 
      });
    }

    // Convert tail to a valid string representing a positive integer
    const tailParsed = parseInt(tailRaw, 10);
    const tailStr = isNaN(tailParsed) || tailParsed < 0 ? '100' : tailParsed.toString();

    let logs: string[] = [];
    try {
        // [Security] Prevent command injection by using execFile with argument arrays
        const { stdout, stderr } = await execFileAsync('docker', ['logs', '--tail', tailStr, containerId]);
        const output = stdout.trim() || stderr.trim();
        if (output) {
            logs = output.split('\n');
        }
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
    // [Security] Sanitize error message to avoid leaking internal paths or sensitive details
    return new Response(JSON.stringify({ error: "Logs indisponibles" }), {
      status: 500, 
      headers: { 'Content-Type': 'application/json' } 
    });
  }
};
