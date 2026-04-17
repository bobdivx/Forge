import type { APIRoute } from 'astro';
import { execSync } from 'child_process';
import path from 'path';

export const GET: APIRoute = async ({ url }) => {
  try {
    const type = url.searchParams.get('type') || 'watchdog';
    const lines = parseInt(url.searchParams.get('lines') || '50', 10);
    
    const logFile = type === 'dashboard' ? 'dashboard.log' : 'watchdog.log';
    const filePath = path.join(process.cwd(), logFile);

    let output = "";
    try {
      output = execSync(`tail -n ${lines} ${filePath}`).toString();
    } catch (e) {
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
    return new Response(JSON.stringify({ error: error.message }), { 
      status: 500, 
      headers: { 'Content-Type': 'application/json' } 
    });
  }
};
