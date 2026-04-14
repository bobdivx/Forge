export type DashboardProject = {
  id: number | string;
  name: string;
  status?: string | null;
};

function statusBadgeClass(status: string | null | undefined) {
  const s = String(status ?? '').toLowerCase();
  return s === 'active' || s === 'online'
    ? 'bg-emerald-500/10 text-emerald-400'
    : 'bg-slate-800 text-slate-500';
}

function ProjectCard({ app }: { app: DashboardProject }) {
  const initial = String(app.name).charAt(0).toUpperCase();
  return (
    <a
      href={`/apps/by-id/${app.id}`}
      class="group bg-slate-900 border border-slate-800 rounded-xl p-5 sm:p-6 hover:border-cyan-500/40 transition block no-underline text-inherit shadow-sm min-h-[4.5rem] w-full min-w-0"
    >
      <div class="flex items-center gap-3">
        <div class="h-9 w-9 rounded-lg flex items-center justify-center font-bold text-base border bg-cyan-500/10 text-cyan-400 border-cyan-500/20 flex-shrink-0">
          {initial}
        </div>
        <div class="min-w-0 flex-1">
          <h4 class="font-semibold text-white group-hover:text-cyan-300 transition text-sm truncate">{app.name}</h4>
          <span class={`text-[10px] px-1.5 py-0.5 rounded-full inline-block mt-0.5 ${statusBadgeClass(app.status)}`}>
            {app.status || 'actif'}
          </span>
        </div>
      </div>
    </a>
  );
}

function ProjectsMobileStack({ projects }: { projects: DashboardProject[] }) {
  return (
    <div class="lg:hidden flex flex-col gap-5 sm:gap-6 w-full min-w-0" role="list" aria-label="Projets actifs">
      {projects.map((app) => (
        <div key={String(app.id)} class="w-full min-w-0" role="listitem">
          <ProjectCard app={app} />
        </div>
      ))}
    </div>
  );
}

type Props = {
  projects: DashboardProject[];
  /** Affiche le bandeau titre + « Voir tout » (défaut : true). Désactiver si la page fournit l’en-tête de section. */
  showHeader?: boolean;
};

export default function DashboardRecentProjects({ projects, showHeader = true }: Props) {
  const list = Array.isArray(projects) ? projects : [];

  return (
    <section class="min-w-0">
      {showHeader && (
        <div class="flex items-center justify-between gap-3 mb-6">
          <div class="flex items-center gap-2 min-w-0">
            <div class="w-1 h-5 bg-cyan-500 rounded-full shrink-0" />
            <h3 class="text-sm font-bold text-white truncate">Projets actifs</h3>
          </div>
          <a href="/apps" class="text-xs text-cyan-400 hover:text-cyan-300 transition shrink-0">
            Voir tout →
          </a>
        </div>
      )}

      {list.length === 0 ? (
        <div class="bg-slate-900 border border-slate-800 rounded-xl p-6 text-center">
          <p class="text-slate-500 text-sm mb-3">Aucun projet en base.</p>
          <a href="/apps" class="btn btn-sm btn-outline border-slate-700 text-slate-300 hover:bg-slate-800">
            Gérer les projets
          </a>
        </div>
      ) : (
        <>
          <ProjectsMobileStack projects={list} />
          <div class="hidden lg:grid lg:grid-cols-2 gap-6 xl:gap-8 min-w-0">
            {list.map((app) => (
              <ProjectCard key={String(app.id)} app={app} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
