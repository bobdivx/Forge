import type { APIRoute } from 'astro';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

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

    // SECURITY: Validate inputs to prevent command injection or malformed args
    // Container ID should be alphanumeric with dashes/underscores
    if (!/^[a-zA-Z0-9_-]+$/.test(containerId)) {
      return new Response(JSON.stringify({ error: "Invalid container ID format" }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Tail should be a number or 'all'
    if (!/^(all|\d+)$/.test(tail)) {
        return new Response(JSON.stringify({ error: "Invalid tail parameter format" }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    // SECURITY: Use execFileAsync with array arguments instead of execSync with string concatenation
    // This completely prevents command injection attacks.
    let logs = [];
    try {
        const { stdout, stderr } = await execFileAsync('docker', ['logs', '--tail', tail, containerId]);
        // Docker logs can sometimes go to stderr depending on the container, try stdout first
        const outputStr = stdout.trim() ? stdout : stderr;
        logs = outputStr.trim().split('\n').filter(Boolean);
    } catch (err: any) {
        // Certains logs sortent sur stderr, checkons stderr si stdout est vide ou si erreur
        if (err.stderr) {
            logs = err.stderr.toString().trim().split('\n').filter(Boolean);
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
