import { useCallback, useEffect, useState } from 'preact/hooks';

type GitSnap = {
  ok: boolean;
  repoPath?: string;
  error?: string;
  branch?: string | null;
  tracking?: string | null;
  ahead?: number | null;
  behind?: number | null;
  worktreeClean?: boolean | null;
  changedFiles?: number | null;
  lastCommit?: string | null;
  hasRemote?: boolean | null;
};

type StoryRow = {
  issueId: number;
  kind: string;
  app: string;
  title: string;
  url: string;
  issueStatus: string;
  assignee: string | null;
  prAuthor: string | null;
  step: string;
  taskId: number | null;
  taskAgentId: string | null;
  taskStatus: string | null;
  snippet: string;
  files: string[];
  delivery: string;
  git?: GitSnap | null;
};

type Payload = {
  ok?: boolean;
  error?: string;
  work?: {
    state: string;
    schedulerActive: boolean;
    lastStartedAt: string | null;
    summaryLine: string;
  };
  apps?: { swarmEnabled: string[]; swarmCount: number };
  pendingQueueCount?: number;
  stories?: StoryRow[];
};

const DELIVERY_FR: Record<string, string> = {
  pushed: 'Commit / poussée détecté(e) dans la réponse',
  committed: 'Commit mentionné (à vérifier sur le dépôt)',
  no_action_needed: 'Aucune action ou déjà à jour (selon l’agent)',
  queued: 'En file',
  agent_running: 'Agent en cours',
  agent_done: 'Réponse agent enregistrée',
  unknown: 'État git non déduit — ouvrir le détail',
};

function deliveryBadgeClass(d: string): string {
  if (d === 'pushed') return 'bg-emerald-100 text-emerald-800';
  if (d === 'committed') return 'bg-green-50 text-green-800';
  if (d === 'no_action_needed') return 'bg-slate-100 text-slate-700';
  if (d === 'queued' || d === 'agent_running') return 'bg-amber-50 text-amber-800';
  return 'bg-gray-100 text-gray-700';
}

function GitRepoPanel({ git }: { git: GitSnap | null | undefined }) {
  if (git == null) return null;
  if (!git.ok) {
    return (
      <div class="mt-3 rounded-xl bg-amber-50/90 px-3 py-2 text-xs text-amber-950 ring-1 ring-amber-100">
        <span class="font-semibold">Dépôt Git (cette machine) :</span>{' '}
        {git.error || 'lecture impossible'}
      </div>
    );
  }

  const ahead = Number(git.ahead ?? 0);
  const behind = Number(git.behind ?? 0);
  let syncLine = '';
  if (!git.hasRemote) {
    syncLine = 'Pas de remote Git configuré — le « push » ne s’applique pas à ce clone.';
  } else if (ahead > 0 && behind > 0) {
    syncLine = `Local : ${ahead} commit(s) en avance · ${behind} commit(s) en retard sur le suivi — à reconciler avant push simple.`;
  } else if (ahead > 0) {
    syncLine = `${ahead} commit(s) local(aux) non présents sur le remote — encore à pousser (git push).`;
  } else if (behind > 0) {
    syncLine = `Branche en retard de ${behind} commit(s) par rapport au remote — envisager git pull / merge.`;
  } else {
    syncLine = 'À jour avec la branche suivie sur cet axe (pas de commits locaux en attente de push).';
  }

  const changed = typeof git.changedFiles === 'number' ? git.changedFiles : 0;
  const dirtyLine =
    git.worktreeClean === false || changed > 0
      ? `Fichiers suivis modifiés ou non indexés : ${changed || '≥1'} (travail pas encore entièrement « figé » en commit).`
      : 'Arbre de travail propre — aucune modification suivie en suspens.';

  return (
    <div class="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-800 ring-1 ring-slate-100">
      <p class="font-semibold text-slate-900">État réel du dépôt (lu sur le disque Forge)</p>
      <ul class="mt-1.5 list-disc space-y-0.5 pl-4 marker:text-slate-400">
        <li>
          Branche <span class="font-mono font-medium">{git.branch ?? '—'}</span>
          {git.tracking ? (
            <>
              {' '}
              · suivi <span class="font-mono">{git.tracking}</span>
            </>
          ) : (
            <span class="text-slate-500"> · pas de branche amont suivie (upstream)</span>
          )}
        </li>
        <li>{syncLine}</li>
        <li>{dirtyLine}</li>
        {git.lastCommit ? (
          <li>
            Dernier commit : <span class="font-mono text-[11px]">{git.lastCommit}</span>
          </li>
        ) : null}
        {git.repoPath ? (
          <li class="break-all text-[10px] text-slate-500">
            Dossier : {git.repoPath.length > 110 ? `${git.repoPath.slice(0, 106)}…` : git.repoPath}
          </li>
        ) : null}
      </ul>
      <p class="mt-2 text-[10px] leading-snug text-slate-500">
        Il s’agit du clone tel qu’il est sur cette machine (branche actuellement checkoutée). Une PR GitHub peut viser une
        autre branche que celle affichée ici.
      </p>
    </div>
  );
}

export default function WorkSimpleStory() {
  const [data, setData] = useState<Payload | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch('/api/work-simple-story')
      .then((r) => r.json())
      .then((j: Payload) => {
        if (j?.ok === false) setErr(typeof j.error === 'string' ? j.error : 'Erreur');
        else {
          setErr(null);
          setData(j);
        }
      })
      .catch(() => setErr('Réseau'));
  }, []);

  useEffect(() => {
    load();
    const id = window.setInterval(load, 18_000);
    return () => window.clearInterval(id);
  }, [load]);

  const w = data?.work;
  const apps = data?.apps;
  const stories = data?.stories ?? [];

  return (
    <section class="rounded-[1.75rem] border border-[#175B37]/15 bg-gradient-to-br from-white via-[#F8FBF9] to-[#EEF6F0] p-5 shadow-sm">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p class="text-[10px] font-black uppercase tracking-[0.2em] text-[#175B37]/80">Ce qui se passe</p>
          <h2 class="mt-1 text-lg font-bold text-gray-900">Fil simple — PR, CI et agents</h2>
          <p class="mt-1 max-w-2xl text-sm text-gray-600">
            Pour chaque application, Forge lit aussi le <span class="font-medium">vrai dépôt Git</span> sur cette machine
            (branche, avance / retard sur le remote, fichiers modifiés, dernier commit). La réponse de l’agent complète
            ce tableau avec ce qu’il affirme avoir fait en texte.
          </p>
        </div>
        <button
          type="button"
          onClick={() => load()}
          class="shrink-0 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 shadow-sm hover:bg-gray-50"
        >
          Actualiser
        </button>
      </div>

      {err && <p class="mt-3 text-sm text-red-600">{err}</p>}

      {!err && w && (
        <div class="mt-4 rounded-2xl border border-white/80 bg-white/90 p-4 text-sm text-gray-800 shadow-inner">
          <p>
            <span class="font-semibold text-gray-900">Travail Forge :</span> {w.summaryLine}
            {w.lastStartedAt && (
              <span class="text-gray-500">
                {' '}
                · dernière session <span class="font-mono text-xs">{w.lastStartedAt.slice(0, 16).replace('T', ' ')}</span>
              </span>
            )}
          </p>
          <p class="mt-2">
            <span class="font-semibold text-gray-900">Applications concernées (swarm activé) :</span>{' '}
            {apps && apps.swarmCount > 0 ? (
              <span>{apps.swarmEnabled.join(', ')}</span>
            ) : (
              <span class="text-amber-700">aucune — activez le swarm sur au moins un projet pour du travail automatique.</span>
            )}
          </p>
          {typeof data?.pendingQueueCount === 'number' && data.pendingQueueCount > 0 && (
            <p class="mt-2 text-xs text-gray-500">
              File globale : <span class="font-semibold text-gray-800">{data.pendingQueueCount}</span> tâche(s){' '}
              <code class="rounded bg-gray-100 px-1">pending</code> — les autres sujets peuvent attendre leur tour.
            </p>
          )}
        </div>
      )}

      <div class="mt-5 space-y-3">
        {stories.length === 0 && !err && (
          <p class="rounded-2xl border border-dashed border-gray-200 bg-white/60 px-4 py-6 text-center text-sm text-gray-500">
            Aucune PR ou échec CI récent dans le carnet. Quand GitHub signale une PR (ex. par Jules), elle apparaîtra ici
            avec l’agent assigné et l’étape.
          </p>
        )}

        {stories.map((s) => (
          <article
            key={s.issueId}
            class="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm transition hover:border-[#175B37]/25"
          >
            <div class="flex flex-wrap items-center gap-2 text-xs text-gray-500">
              <span class="rounded-full bg-gray-100 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide">
                {s.kind === 'pr_review' ? 'PR GitHub' : 'CI'}
              </span>
              <span class="font-semibold text-gray-900">{s.app}</span>
              {s.prAuthor && (
                <span>
                  auteur PR : <span class="font-medium text-gray-800">{s.prAuthor}</span>
                </span>
              )}
              {s.assignee && (
                <span>
                  agent : <span class="font-medium text-gray-800">{s.assignee}</span>
                </span>
              )}
            </div>
            <h3 class="mt-2 text-base font-bold text-gray-900">{s.title}</h3>
            <p class="mt-1 text-sm text-[#175B37] font-medium">{s.step}</p>
            <div class="mt-2 flex flex-wrap items-center gap-2">
              <span class={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${deliveryBadgeClass(s.delivery)}`}>
                {DELIVERY_FR[s.delivery] ?? s.delivery}
              </span>
              {s.taskId != null && (
                <span class="text-[11px] text-gray-500">
                  Tâche #{s.taskId}
                  {s.taskAgentId ? ` · ${s.taskAgentId}` : ''}
                </span>
              )}
            </div>
            <GitRepoPanel git={s.git} />
            {s.files.length > 0 && (
              <div class="mt-3">
                <p class="text-[10px] font-bold uppercase tracking-wider text-gray-400">Fichiers mentionnés</p>
                <ul class="mt-1 flex flex-wrap gap-1.5">
                  {s.files.map((f) => (
                    <li
                      key={f}
                      class="rounded-lg bg-gray-50 px-2 py-0.5 font-mono text-[11px] text-gray-800 ring-1 ring-gray-100"
                    >
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {s.snippet && (
              <p class="mt-3 line-clamp-3 border-t border-gray-50 pt-3 text-xs leading-relaxed text-gray-600">
                {s.snippet}
              </p>
            )}
            <div class="mt-3 flex flex-wrap gap-3">
              {s.url && (
                <a
                  href={s.url}
                  target="_blank"
                  rel="noreferrer"
                  class="text-xs font-semibold text-[#175B37] underline-offset-2 hover:underline"
                >
                  Ouvrir sur GitHub
                </a>
              )}
              <button
                type="button"
                class="text-xs font-semibold text-gray-600 hover:text-gray-900"
                onClick={() => (window as unknown as { __openWorkDetail?: (t: string, id: number) => void }).__openWorkDetail?.('issue', s.issueId)}
              >
                Détail dans Forge
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
