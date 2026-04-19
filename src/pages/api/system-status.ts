import type { APIRoute } from 'astro';
import os from 'os';
import { execSync } from 'child_process';
import { db, Config, eq } from 'astro:db';

export const GET: APIRoute = async () => {
  try {
    const isVercel = !!process.env.VERCEL || !!process.env.VERCEL_ENV;
    
    if (isVercel) {
      return new Response(JSON.stringify({
        memoryUsage: null,
        cpuLoad: null,
        uptime: null,
        diskUsage: null,
        platform: 'vercel-edge',
        note: 'Métriques hôte non disponibles en serverless (pas de lecture OS réelle).'
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

    let diskUsage = null;
    let githubDiskUsage = null;
    try {
      const dfOutput = execSync('df -h /mnt/Docker --output=pcent').toString();
      const match = dfOutput.match(/(\d+)%/);
      if (match) diskUsage = parseInt(match[1]);

      const dfGitHub = execSync('df -h /mnt/GitHub --output=pcent').toString();
      const matchGH = dfGitHub.match(/(\d+)%/);
      if (matchGH) githubDiskUsage = parseInt(matchGH[1]);
    } catch (e) {
      console.error("Failed to fetch disk usage", e);
    }

    const lastMaint = await db.select().from(Config).where(eq(Config.key, 'lastMaintenanceCycle')).get();

    return new Response(JSON.stringify({
      memoryUsage: memPercent,
      cpuLoad: cpuPercent,
      uptime: os.uptime(),
      diskUsage: diskUsage,
      githubDiskUsage: githubDiskUsage,
      platform: os.platform(),
      lastMaintenance: lastMaint?.value ?? null
    }), { 
      status: 200, 
      headers: { 'Content-Type': 'application/json' } 
    });
  } catch (error) {
    console.error("System status error:", error);
    return new Response(JSON.stringify({ error: "Sonde indisponible" }), { 
      status: 500, 
      headers: { 'Content-Type': 'application/json' } 
    });
  }
};
