import type { APIRoute } from 'astro';
import os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';
import { db, Config, eq } from 'astro:db';

const execAsync = promisify(exec);

/** BusyBox `df` (Alpine) ne supporte pas `--output=pcent`. Lit la colonne capacité type `85%`. */
async function diskUsagePercentFromDfAsync(targetPath: string): Promise<number | null> {
  try {
    const { stdout } = await execAsync(`df -P "${targetPath}" 2>/dev/null || df -P / 2>/dev/null || true`);
    const dfOutput = stdout.toString();
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
      // ⚡ Bolt: Fetch system data concurrently without blocking the event loop
      // Parallelizes 3 IO-bound system calls to reduce overall request latency
      const [diskDocker, diskGithub, unhealthyStdout] = await Promise.all([
        diskUsagePercentFromDfAsync('/mnt/Docker'),
        diskUsagePercentFromDfAsync('/mnt/GitHub'),
        execAsync('docker ps --filter "health=unhealthy" --format "{{.Names}}"').catch(() => ({ stdout: '' }))
      ]);
      
      diskUsage = diskDocker;
      githubDiskUsage = diskGithub;
      const unhealthy = unhealthyStdout.stdout.toString();
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
