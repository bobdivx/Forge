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

    // Strict validation to prevent injection
    if (!/^[a-zA-Z0-9_-]+$/.test(containerId)) {
      return new Response(JSON.stringify({ error: "Format d'ID de conteneur invalide" }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (!/^\d+$/.test(tail)) {
      return new Response(JSON.stringify({ error: "Le paramètre tail doit être un nombre" }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    let logs: string[] = [];
    try {
        const { stdout, stderr } = await execFileAsync('docker', ['logs', '--tail', tail, containerId]);
        // Docker logs may output to either stdout or stderr depending on the application
        const combinedOutput = (stdout + '\n' + stderr).trim();
        logs = combinedOutput ? combinedOutput.split('\n') : [];
    } catch (err: any) {
        // Some errors output via stderr property in child_process exceptions
        if (err.stderr) {
            logs = err.stderr.toString().trim().split('\n');
        } else {
            // Sanitize error messages to prevent leakage
            const sanitizedError = err.message ? err.message.replace(/['"]/g, '') : "Erreur inconnue";
            throw new Error(`Erreur d'exécution: ${sanitizedError.substring(0, 100)}`);
        }
    }

    return new Response(JSON.stringify({ logs }), { 
      status: 200, 
      headers: { 'Content-Type': 'application/json' } 
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: "Logs indisponibles" }), {
      status: 500, 
      headers: { 'Content-Type': 'application/json' } 
    });
  }
};
