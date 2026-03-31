import type { APIRoute } from 'astro';
import os from 'os';

export const GET: APIRoute = async () => {
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
};
