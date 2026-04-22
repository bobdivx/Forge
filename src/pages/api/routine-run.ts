import type { APIRoute } from 'astro';
import { getAllConfig } from '../../lib/config-db';
import { invokeOpenClawAgentTask } from '../../lib/openclaw-gateway';
import { attemptOpenClawPreRepair } from './_openclaw-pre-repair';

export const POST: APIRoute = async () => {
  const preRepair = await attemptOpenClawPreRepair('routine-run');
  const cfg = await getAllConfig();
  const githubRoot = (cfg.routineGithubRoot || cfg.forgeReposRoot || '').trim();
  const watchAgent = (cfg.routineWatchAgentId || 'MAINTENANCE_REPO').trim().toUpperCase();
  const improveAgent = (cfg.routineImproveAgentId || 'VEILLE_TECH').trim().toUpperCase();
  const interval = Number.parseInt(cfg.routineIntervalMinutes || '60', 10);

  if (!githubRoot) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: 'Le répertoire GitHub de routine est vide. Configure-le dans le menu Routine.',
      }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const watchMessage =
    `[FORGE Routine] Surveille le répertoire ${githubRoot}. ` +
    `Vérifie l'état git des applications et signale les anomalies importantes.`;
  const improveMessage =
    `[FORGE Routine] Analyse les applications dans ${githubRoot} et propose des améliorations concrètes ` +
    `priorisées (fiabilité, sécurité, DX, performance). Rythme cible: toutes les ${Number.isFinite(interval) ? interval : 60} minutes.`;

  const [watchResult, improveResult] = await Promise.all([
    invokeOpenClawAgentTask({ agentId: watchAgent, message: watchMessage }),
    invokeOpenClawAgentTask({ agentId: improveAgent, message: improveMessage }),
  ]);

  return new Response(
    JSON.stringify({
      ok: watchResult.ok || improveResult.ok,
      preRepair,
      watchAgent,
      improveAgent,
      watchResult,
      improveResult,
    }),
    {
      status: watchResult.ok || improveResult.ok ? 200 : 502,
      headers: { 'Content-Type': 'application/json' },
    },
  );
};
