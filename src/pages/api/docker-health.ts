import type { APIRoute } from 'astro';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export const GET: APIRoute = async () => {
  try {
    // 🛡️ Sentinel: Use execFileAsync to prevent DoS via event loop blocking
    // and argument arrays to prevent command injection.
    const format = '{"ID":"{{.ID}}","Names":"{{.Names}}","Image":"{{.Image}}","Status":"{{.Status}}","State":"{{.State}}","Ports":"{{.Ports}}"}';
    const { stdout } = await execFileAsync('docker', ['ps', '-a', '--format', format]);
    const output = stdout.trim();
    
    if (!output) {
      return new Response(JSON.stringify({ containers: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const containers = output.split('\n').map((line) => JSON.parse(line));
    
    return new Response(JSON.stringify({ containers }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error fetching docker health:', error);
    return new Response(JSON.stringify({ error: 'Failed to fetch docker stats' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
