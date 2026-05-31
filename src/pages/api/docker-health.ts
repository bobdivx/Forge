import type { APIRoute } from 'astro';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export const GET: APIRoute = async () => {
  try {
    const format = '{"ID":"{{.ID}}","Names":"{{.Names}}","Image":"{{.Image}}","Status":"{{.Status}}","State":"{{.State}}","Ports":"{{.Ports}}"}';
    // 🛡️ Sentinel: Use execFileAsync with argument arrays instead of execSync to prevent command injection
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
