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

    // Input validation to prevent argument injection
    const safeInputRegex = /^[a-zA-Z0-9_.-]+$/;
    if (!safeInputRegex.test(containerId) || !safeInputRegex.test(tail)) {
      return new Response(JSON.stringify({ error: "Paramètres invalides" }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    let logs: string[] = [];
    try {
        const { stdout } = await execFileAsync('docker', ['logs', '--tail', tail, containerId]);
        logs = stdout.trim().split('\n');
    } catch (err: any) {
        // Certains logs sortent sur stderr, checkons stderr si stdout est vide ou si erreur
        let combinedOutput = "";
        if (err.stdout) combinedOutput += err.stdout.toString();
        if (err.stderr) combinedOutput += err.stderr.toString();

        if (combinedOutput.trim()) {
            logs = combinedOutput.trim().split('\n');
        } else {
            throw err; // Vraie erreur d'exécution
        }
    }

    return new Response(JSON.stringify({ logs }), { 
      status: 200, 
      headers: { 'Content-Type': 'application/json' } 
    });
  } catch (error: any) {
    // Ne pas exposer error.message au client pour éviter la fuite d'informations
    return new Response(JSON.stringify({ error: "Logs indisponibles" }), {
      status: 500, 
      headers: { 'Content-Type': 'application/json' } 
    });
  }
};
