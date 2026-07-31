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

    if (!containerId || containerId.startsWith('-')) {
      return new Response(JSON.stringify({ error: "ID du conteneur manquant ou invalide" }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (tail.startsWith('-')) {
      return new Response(JSON.stringify({ error: "Paramètre tail invalide" }), {
        status: 400, 
        headers: { 'Content-Type': 'application/json' } 
      });
    }

    // Commande Docker pour récupérer les logs
    let logs = [];
    try {
        const { stdout, stderr } = await execFileAsync('docker', ['logs', '--tail', tail, containerId]);

        // Certains logs sortent sur stderr, ou on peut avoir les deux
        const output = stdout.toString() + (stderr ? stderr.toString() : '');
        logs = output.trim().split('\n');
    } catch (err: any) {
        // Certains logs sortent sur stderr en cas d'erreur de la commande (ex: non zero exit code)
        if (err.stderr) {
            logs = err.stderr.toString().trim().split('\n');
        } else {
            throw new Error("Erreur lors de la récupération des logs");
        }
    }

    return new Response(JSON.stringify({ logs }), { 
      status: 200, 
      headers: { 'Content-Type': 'application/json' } 
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: "Logs indisponibles: Erreur d'exécution" }), {
      status: 500, 
      headers: { 'Content-Type': 'application/json' } 
    });
  }
};
