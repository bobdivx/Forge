import type { APIRoute } from 'astro';
import { execSync } from 'child_process';

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

    const command = "docker ps --format '{{json .}}'";
    const output = execSync(command).toString();
    const containers = output.trim().split('\n')
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
