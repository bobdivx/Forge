import type { APIRoute } from 'astro';
import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';

const execFileAsync = promisify(execFile);

export const GET: APIRoute = async ({ url }) => {
  try {
    const type = url.searchParams.get('type') || 'watchdog';
    let lines = parseInt(url.searchParams.get('lines') || '50', 10);
    if (isNaN(lines) || lines <= 0) lines = 50;

    const logFile = type === 'dashboard' ? 'dashboard.log' : 'watchdog.log';
    const filePath = path.join(process.cwd(), logFile);

    let output = "";
    try {
      const { stdout } = await execFileAsync('tail', ['-n', lines.toString(), filePath]);
      output = stdout;
    } catch (e: any) {
      if (e.stderr) {
        output = e.stderr.toString();
      } else {
        output = "Erreur lors de la lecture du fichier log.";
      }
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
    const safeError = error instanceof Error ? error.message.replace(/\/[\w\-\.\/]+/g, '[PATH]') : "Unknown error";
    return new Response(JSON.stringify({ error: safeError }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
