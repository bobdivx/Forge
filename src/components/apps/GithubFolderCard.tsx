import type { GithubFolderSummary } from '../../lib/project-github-meta';

type Props = {
  summary: GithubFolderSummary;
};

function truncateUrl(s: string, max: number) {
  const t = String(s ?? '').trim();
  if (t.length <= max) return t;
  return t.slice(0, max - 1) + '…';
}

function githubWebUrl(remote: string): string | null {
  const u = remote.trim();
  if (!u) return null;
  if (/^https:\/\/github\.com\//i.test(u)) {
    return u.replace(/\.git$/i, '');
  }
  const m = /^git@github\.com:([^/]+\/[^/]+?)(?:\.git)?$/i.exec(u);
  if (m) return `https://github.com/${m[1]}`;
  return null;
}

export default function GithubFolderCard({ summary }: Props) {
  const g = summary;
  const web = g.remoteOriginUrl ? githubWebUrl(g.remoteOriginUrl) : null;

  return (
    <section class="bg-white rounded-[1.5rem] shadow-sm border border-gray-100 p-6">
      <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 class="text-base font-semibold text-gray-900">GitHub sur disque</h3>
          <p class="text-[11px] text-gray-400 mt-1">
            Contenu de <span class="font-mono">.github/</span> et remote <span class="font-mono">origin</span> pour aider
            les agents (CI, templates, Dependabot).
          </p>
        </div>
        <div class="flex flex-wrap gap-2 justify-end shrink-0">
          <span
            class={`text-[10px] font-semibold px-2.5 py-1 rounded-full ${
              g.present ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'
            }`}
          >
            {g.present ? `.github présent` : 'Pas de .github'}
          </span>
          {g.present && g.workflows.length > 0 && (
            <span class="text-[10px] font-semibold px-2.5 py-1 rounded-full bg-blue-50 text-blue-700">
              {g.workflows.length} workflow{g.workflows.length > 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>

      {g.remoteOriginUrl && (
        <div class="mt-4 pt-4 border-t border-gray-100">
          <p class="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">Remote origin</p>
          <p class="text-xs font-mono text-gray-600 break-all">{truncateUrl(g.remoteOriginUrl, 160)}</p>
          {web && (
            <a
              href={web}
              target="_blank"
              rel="noopener noreferrer"
              class="inline-block mt-2 text-xs font-medium hover:underline"
              style={{ color: '#175B37' }}
            >
              Ouvrir sur GitHub →
            </a>
          )}
        </div>
      )}

      <div class="mt-4 flex flex-wrap gap-2">
        {g.dependabot && (
          <span class="text-[10px] px-2 py-0.5 rounded-md bg-purple-50 text-purple-700">Dependabot</span>
        )}
        {g.codeowners !== false && (
          <span class="text-[10px] px-2 py-0.5 rounded-md bg-amber-50 text-amber-800">
            CODEOWNERS ({g.codeowners})
          </span>
        )}
        {g.funding && (
          <span class="text-[10px] px-2 py-0.5 rounded-md bg-pink-50 text-pink-700">FUNDING</span>
        )}
        {g.issueTemplatesCount > 0 && (
          <span class="text-[10px] px-2 py-0.5 rounded-md bg-gray-100 text-gray-700">
            {g.issueTemplatesCount} template(s) issue
          </span>
        )}
        {g.pullRequestTemplatePaths.length > 0 && (
          <span class="text-[10px] px-2 py-0.5 rounded-md bg-gray-100 text-gray-700">
            PR template
          </span>
        )}
      </div>

      {g.present && g.workflows.length > 0 && (
        <details class="mt-4 group">
          <summary class="cursor-pointer text-sm font-medium text-gray-800 list-none flex items-center gap-2 [&::-webkit-details-marker]:hidden">
            <span class="text-gray-400 group-open:rotate-90 transition-transform inline-block">▸</span>
            Workflows ({g.workflows.length})
          </summary>
          <ul class="mt-3 space-y-2 text-[11px] font-mono text-gray-600 border border-gray-100 rounded-xl p-3 bg-gray-50 max-h-48 overflow-y-auto">
            {g.workflows.map((w) => (
              <li key={w.relativePath} class="flex flex-col gap-0.5">
                <span class="text-gray-800">{w.relativePath}</span>
                {w.workflowName && <span class="text-gray-400">name: {w.workflowName}</span>}
              </li>
            ))}
          </ul>
        </details>
      )}

      {!g.present && !g.remoteOriginUrl && (
        <p class="mt-4 text-xs text-gray-400">
          Aucun dossier <span class="font-mono">.github</span> et aucune remote <span class="font-mono">origin</span>{' '}
          détectée à cet emplacement.
        </p>
      )}
    </section>
  );
}
