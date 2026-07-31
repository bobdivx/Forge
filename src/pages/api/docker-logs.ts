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

    // Commande Docker pour récupérer les logs
    let logs = [];
    try {
        // Utilisation de execFile pour éviter l'injection de commandes
        const { stdout, stderr } = await execFileAsync('docker', ['logs', '--tail', tail, containerId]);

        // docker logs sort souvent sur stderr même en cas de succès, on combine ou on priorise
        const output = stdout.trim() || stderr.trim();
        logs = output ? output.split('\n') : [];
    } catch (err: any) {
        // En cas d'erreur de la commande docker
        if (err.stderr) {
            logs = err.stderr.toString().trim().split('\n');
        } else if (err.stdout) {
            logs = err.stdout.toString().trim().split('\n');
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
