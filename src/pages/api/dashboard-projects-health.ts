import type { APIRoute } from 'astro';
import { desc } from 'drizzle-orm';
import { loadAstroDb } from '../../lib/load-astro-db';
import { resolveProjectPathFromDbProject } from '../../lib/forge-repos';
import { getPrimaryDevServerStatus } from '../../lib/dev-server-status';
import { getWorkSystemStatus } from '../../lib/forge-work-scheduler';
import { fetchZimaOSSessionsPayload, normalizeZimaOSSessions } from '../../lib/forge-gateway';

type ProjectRow = {
  id: number;
  name: string;
  path: string | null;
  status: string | null;
  swarmEnabled: number | null;
  updatedAt: Date | null;
};

function mapSessionToRunState(raw: Record<string, unknown>): { running: boolean } {
  const mapped = raw as Record<string, unknown>;
  const st = String(mapped.status ?? mapped.state ?? '').toLowerCase();
  const active =
    st === 'running' ||
    st === 'active' ||
    st === 'connected' ||
    st === 'online' ||
    st === 'actif';
  return { running: active };
}

/** GET — état synthétique pour la carte Projets du dashboard (poll léger). */
export const GET: APIRoute = async ({ locals }) => {
  const email = locals.user?.email as string | undefined;
  const zimaosSessionPromise = fetchZimaOSSessionsPayload(email);
  // Attach a dummy catch handler immediately to prevent UnhandledPromiseRejection
  // if the fetch fails before we await it later in the final try/catch block.
  zimaosSessionPromise.catch(() => {});

  const payload: {
    projects: Array<{
      id: number;
      name: string;
      swarmEnabled: boolean;
      devServer: {
        ok: boolean;
        running?: boolean;
        pidTracked?: boolean;
        portOccupiedExternally?: boolean;
        label?: string;
        port?: number;
        hint?: string;
      };
      tasks: { pendingOrRunning: number; running: number };
    }>;
    swarm: {
      zimaosOk: boolean;
      zimaosSessions: number;
      agentsBusy: number;
      zimaosError: string | null;
      workScheduler: Awaited<ReturnType<typeof getWorkSystemStatus>> | null;
    };
    dbError: string | null;
  } = {
    projects: [],
    swarm: {
      zimaosOk: false,
      zimaosSessions: 0,
      agentsBusy: 0,
      zimaosError: null,
      workScheduler: null,
    },
    dbError: null,
  };

  try {
    const { db, Project, AgentTask } = await loadAstroDb();
    const projects = await db.select().from(Project).orderBy(desc(Project.updatedAt)).limit(12);

    const tasksAll = await db.select().from(AgentTask).limit(500);

    const countForProject = (pid: number | null | undefined) => {
      const pend = tasksAll.filter(
        (t) =>
          t.projectId === pid &&
          ['pending', 'bug', 'running'].includes(String(t.status || '').toLowerCase()),
      );
      const running = pend.filter((t) => String(t.status || '').toLowerCase() === 'running').length;
      return { pendingOrRunning: pend.length, running };
    };

    for (const p of projects as ProjectRow[]) {
      let dev: {
        ok: boolean;
        running?: boolean;
        pidTracked?: boolean;
        portOccupiedExternally?: boolean;
        label?: string;
        port?: number;
        hint?: string;
      } = {
        ok: false,
        hint: 'Chemin projet introuvable sur le serveur Forge',
      };

      try {
        const resolved = await resolveProjectPathFromDbProject({
          name: p.name,
          path: p.path,
        });
        if (resolved) {
          const st = await getPrimaryDevServerStatus(resolved);
          if (st) {
            dev = {
              ok: true,
              running: st.running,
              pidTracked: st.pidAlive,
              portOccupiedExternally: st.externalProcess,
              label: st.label,
              port: st.port,
              hint: st.externalProcess
                ? `Port ${st.port} occupé (autre processus). Libérez le port ou arrêtez l’autre serveur.`
                : !st.running
                  ? `Serveur dev arrêté (config ${st.label} · port ${st.port}).`
                  : st.pidAlive
                    ? `Serveur suivi par Forge (PID).`
                    : `Port ${st.port} répond (processus non suivi par Forge).`,
            };
          } else {
            dev = {
              ok: true,
              hint: 'Ajoutez `.forge/app-dashboard.json` avec une entrée `servers` pour suivre le dev local.',
            };
          }
        }
      } catch {
        dev.hint = 'Erreur lecture disque';
      }

      payload.projects.push({
        id: p.id,
        name: p.name,
        swarmEnabled: Number(p.swarmEnabled) === 1,
        devServer: dev,
        tasks: countForProject(p.id),
      });
    }

    payload.swarm.workScheduler = await getWorkSystemStatus();
  } catch (e) {
    payload.dbError = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const oc = await zimaosSessionPromise;
    payload.swarm.zimaosOk = oc.ok;
    const sessions = oc.ok
      ? (normalizeZimaOSSessions(oc.data) as Record<string, unknown>[])
      : [];
    payload.swarm.zimaosSessions = sessions.length;
    let busy = 0;
    for (const s of sessions) {
      if (mapSessionToRunState(s as Record<string, unknown>).running) busy++;
    }
    payload.swarm.agentsBusy = busy;
    payload.swarm.zimaosError = oc.ok ? null : oc.error ?? null;
  } catch (e) {
    payload.swarm.zimaosError = e instanceof Error ? e.message : String(e);
  }

  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
