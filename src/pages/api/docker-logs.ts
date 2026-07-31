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

    // Validation des entrées pour prévenir l'injection d'arguments
    if (containerId.startsWith('-') || tail.startsWith('-')) {
      return new Response(JSON.stringify({ error: "Format d'entrée invalide" }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    let logs: string[] = [];
    try {
        const { stdout, stderr } = await execFileAsync('docker', ['logs', '--tail', tail, containerId]);
        // Certains logs sortent sur stderr, fusionnons ou prenons stdout si dispo
        const output = stdout.trim() || stderr.trim();
        logs = output ? output.split('\n') : [];
    } catch (err: any) {
        // En cas d'erreur de commande (ex: conteneur introuvable), docker renvoie les infos sur stderr
        if (err.stderr) {
            logs = err.stderr.toString().trim().split('\n');
        } else {
            // Ne pas fuiter le message d'erreur brut au client pour des raisons de sécurité
            throw new Error("Erreur d'exécution de la commande");
        }
    }

    return new Response(JSON.stringify({ logs }), { 
      status: 200, 
      headers: { 'Content-Type': 'application/json' } 
    });
  } catch (error: any) {
    // Ne pas fuiter le message d'erreur brut au client pour des raisons de sécurité
    return new Response(JSON.stringify({ error: "Logs indisponibles suite à une erreur interne" }), {
      status: 500, 
      headers: { 'Content-Type': 'application/json' } 
    });
  }
};
