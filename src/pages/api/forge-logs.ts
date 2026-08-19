import type { APIRoute } from 'astro';
import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';

const execFileAsync = promisify(execFile);

export const GET: APIRoute = async ({ url }) => {
  try {
    const type = url.searchParams.get('type') || 'watchdog';
    // Validate inputs to prevent argument injection
    const linesStr = url.searchParams.get('lines') || '50';
    const lines = parseInt(linesStr, 10);

    if (isNaN(lines) || lines <= 0) {
      return new Response(JSON.stringify({ error: 'Paramètre lines invalide.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const logFile = type === 'dashboard' ? 'dashboard.log' : 'watchdog.log';
    const filePath = path.join(process.cwd(), logFile);

    let output = "";
    try {
      // Use execFile with argument array instead of execSync to prevent command injection and event loop blocking
      const { stdout } = await execFileAsync('tail', ['-n', lines.toString(), filePath]);
      output = stdout;
    } catch (e: any) {
      // Return a purely generic message to prevent leaking absolute server paths via tail's stderr
      output = "Erreur lors de la lecture du fichier log.";
    }

    const logLines = output.trim().split('\n').reverse();

    return new Response(JSON.stringify({
        logs: logLines,
        file: logFile,
        timestamp: new Date().toISOString()
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error: any) {
    // Return generic error message to prevent leaking internal stack traces or paths
    return new Response(JSON.stringify({ error: 'Erreur interne du serveur lors de la récupération des logs.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
