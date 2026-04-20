import type { APIRoute } from 'astro';
import os from 'os';
import { execSync } from 'child_process';
import { db, Config, eq } from 'astro:db';

/** BusyBox `df` (Alpine) ne supporte pas `--output=pcent`. Lit la colonne capacité type `85%`. */
function diskUsagePercentFromDf(targetPath: string): number | null {
  try {
    const dfOutput = execSync(`df -P "${targetPath}" 2>/dev/null || df -P / 2>/dev/null || true`)
      .toString();
    const lines = dfOutput.trim().split('\n').filter(Boolean);
    const last = lines[lines.length - 1];
    const parts = last?.trim().split(/\s+/);
    const pct =
      parts?.find((p) => /^\d+%$/.test(p)) ??
      parts?.find((p, i) => i >= 4 && /^\d+%$/.test(p));
    if (pct) return parseInt(pct.replace('%', ''), 10);
  } catch {
    /* ignore */
  }
  return null;
}

export const GET: APIRoute = async () => {
  try {
    const isVercel = !!process.env.VERCEL || !!process.env.VERCEL_ENV;

    if (isVercel) {
      return new Response(
        JSON.stringify({
          memoryUsage: null,
          cpuLoad: null,
          uptime: null,
          diskUsage: null,
          platform: 'vercel-edge',
          note: 'Métriques hôte non disponibles en serverless (pas de lecture OS réelle).',
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }

    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const memPercent = Math.round((usedMem / totalMem) * 100);

    const loadAvg = os.loadavg();
    const cpuPercent = Math.round((loadAvg[0] / os.cpus().length) * 100);

    let diskUsage: number | null = null;
    let githubDiskUsage: number | null = null;
    let unhealthyContainers: string[] = [];
    try {
      diskUsage = diskUsagePercentFromDf('/mnt/Docker');
      githubDiskUsage = diskUsagePercentFromDf('/mnt/GitHub');
      
      const unhealthy = execSync('docker ps --filter "health=unhealthy" --format "{{.Names}}"').toString();
      unhealthyContainers = unhealthy.split('\n').filter(Boolean);
    } catch (e) {
      console.error('Failed to fetch system data', e);
    }

    const lastMaint = await db.select().from(Config).where(eq(Config.key, 'lastMaintenanceCycle')).get();

    return new Response(
      JSON.stringify({
        memoryUsage: memPercent,
        cpuLoad: cpuPercent,
        uptime: os.uptime(),
        diskUsage,
        githubDiskUsage,
        unhealthyContainers,
        platform: os.platform(),
        lastMaintenance: lastMaint?.value ?? null,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  } catch (error) {
    console.error('System status error:', error);
    return new Response(JSON.stringify({ error: 'Sonde indisponible' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
