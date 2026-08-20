import type { APIRoute } from 'astro';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export const GET: APIRoute = async () => {
  try {
    const isVercel = !!process.env.VERCEL || !!process.env.VERCEL_ENV;
    
    if (isVercel) {
      return new Response(JSON.stringify({
        containers: [],
        note: "Docker metrics unavailable on Vercel"
      }), { 
        status: 200, 
        headers: { 'Content-Type': 'application/json' } 
      });
    }

    // 🛡️ Sentinel: Use execFileAsync to prevent DoS via event loop blocking
    // and argument arrays to prevent command injection.
    const { stdout } = await execFileAsync('docker', ['ps', '--format', '{{json .}}']);
    const containers = stdout.trim().split('\n')
      .filter(line => line.trim() !== '')
      .map(line => JSON.parse(line));

    return new Response(JSON.stringify(containers), { 
      status: 200, 
      headers: { 'Content-Type': 'application/json' } 
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: "Docker stats indisponibles" }), { 
      status: 500, 
      headers: { 'Content-Type': 'application/json' } 
    });
  }
};
