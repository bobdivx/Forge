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

    // Validation de sécurité : éviter l'injection de drapeaux ou commandes
    if (!containerId || containerId.startsWith('-') || tail.startsWith('-')) {
      return new Response(JSON.stringify({ error: "ID du conteneur manquant ou invalide" }), {
        status: 400, 
        headers: { 'Content-Type': 'application/json' } 
      });
    }

    let logs: string[] = [];
    try {
        // Utiliser execFile au lieu de execSync pour éviter les injections de commande et le blocage de l'event loop
        const { stdout, stderr } = await execFileAsync('docker', ['logs', '--tail', tail, containerId]);

        // docker logs écrit souvent sur stderr (ou stdout + stderr combinés)
        const combined = (stdout + '\n' + stderr).trim();
        logs = combined ? combined.split('\n') : [];
    } catch (err: any) {
        if (err.stderr || err.stdout) {
            const combined = ((err.stdout || '') + '\n' + (err.stderr || '')).trim();
            logs = combined ? combined.split('\n') : [];
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
