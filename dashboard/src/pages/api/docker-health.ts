import type { APIRoute } from 'astro';
import { execSync } from 'child_process';

export const GET: APIRoute = async () => {
  try {
    const output = execSync('docker ps -a --format "{{json .}}"').toString().trim();
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
