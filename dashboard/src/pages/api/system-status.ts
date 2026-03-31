import type { APIRoute } from 'astro';
import os from 'os';

export const GET: APIRoute = async () => {
  try {
    const isVercel = !!process.env.VERCEL || !!process.env.VERCEL_ENV;
    
    if (isVercel) {
      // Return mock or limited data for Vercel sandbox
      return new Response(JSON.stringify({
        memoryUsage: 15,
        cpuLoad: 5,
        uptime: os.uptime(),
        platform: 'vercel-edge',
        note: "Metrics unavailable in serverless sandbox"
      }), { 
        status: 200, 
        headers: { 'Content-Type': 'application/json' } 
      });
    }

    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const memPercent = Math.round((usedMem / totalMem) * 100);
    
    const loadAvg = os.loadavg();
    const cpuPercent = Math.round((loadAvg[0] / os.cpus().length) * 100);

    return new Response(JSON.stringify({
      memoryUsage: memPercent,
      cpuLoad: cpuPercent,
      uptime: os.uptime(),
      platform: os.platform()
    }), { 
      status: 200, 
      headers: { 'Content-Type': 'application/json' } 
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: "Sonde indisponible" }), { 
      status: 500, 
      headers: { 'Content-Type': 'application/json' } 
    });
  }
};
