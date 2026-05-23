import { useState, useEffect } from 'preact/hooks';

export default function GithubImportModal() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [repos, setRepos] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState<string | null>(null);

  const fetchRepos = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/github-repos');
      const data = await res.json();
      if (res.ok) {
        setRepos(data.repos);
      } else {
        setError(data.error);
      }
    } catch (e) {
      setError('Erreur réseau lors de la communication avec l\'API.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      fetchRepos();
    }
  }, [open]);

  const handleImport = async (repoUrl: string, repoName: string) => {
    setImporting(repoName);
    try {
      const res = await fetch('/api/github-clone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoUrl, repoName }),
      });
      const data = await res.json();
      if (res.ok) {
        alert(data.message);
        setOpen(false);
        // Force sync endpoint to update the list immediately
        await fetch('/api/sync-projects', { method: 'POST', body: '{}' });
        window.location.reload();
      } else {
        alert('Erreur: ' + data.error);
      }
    } catch (e) {
      alert('Erreur réseau.');
    } finally {
      setImporting(null);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        class="flex items-center gap-2 border text-sm font-semibold px-4 py-2.5 rounded-xl shadow-sm transition-all bg-white text-gray-700 border-gray-200 hover:border-[#175B37]/50 hover:bg-[#E9F3EB] hover:text-[#175B37]"
        title="Importer depuis GitHub"
      >
        <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
          <path fill-rule="evenodd" clip-rule="evenodd" d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.464-1.11-1.464-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.161 22 16.416 22 12c0-5.523-4.477-10-10-10z" />
        </svg>
        Importer GitHub
      </button>

      {open && (
        <div class="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => setOpen(false)}>
          <div class="w-full max-w-2xl max-h-[85vh] bg-white rounded-[1.5rem] shadow-xl flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
            <div class="p-6 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
              <h2 class="text-xl font-bold text-gray-900 flex items-center gap-3">
                <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path fill-rule="evenodd" clip-rule="evenodd" d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.464-1.11-1.464-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.161 22 16.416 22 12c0-5.523-4.477-10-10-10z" /></svg>
                Importer un dépôt
              </h2>
              <button onClick={() => setOpen(false)} class="p-2 text-gray-400 hover:bg-gray-100 rounded-full transition-colors">
                <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div class="flex-1 overflow-y-auto p-6 bg-white">
              {loading && (
                <div class="flex flex-col items-center justify-center py-10 text-[#175B37]">
                  <div class="w-8 h-8 border-4 border-[#175B37]/30 border-t-[#175B37] rounded-full animate-spin mb-4"></div>
                  <p class="font-medium text-sm">Connexion à GitHub en cours...</p>
                </div>
              )}

              {error && (
                <div class="bg-red-50 text-red-600 p-4 rounded-xl text-sm border border-red-100 flex flex-col items-center text-center">
                  <svg class="w-8 h-8 mb-2 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                  {error}
                  <a href="/settings" class="mt-3 text-xs bg-white text-red-600 px-3 py-1.5 rounded-lg border border-red-200 hover:bg-red-50">Vérifier le Jeton dans Paramètres</a>
                </div>
              )}

              {!loading && !error && repos.length === 0 && (
                <div class="text-center text-gray-500 py-10">Aucun dépôt trouvé sur votre compte GitHub.</div>
              )}

              {!loading && !error && repos.length > 0 && (
                <div class="space-y-3">
                  {repos.map(repo => (
                    <div key={repo.id} class="flex items-center justify-between p-4 border border-gray-100 rounded-xl hover:border-gray-200 hover:shadow-sm transition-all group">
                      <div class="flex-1 min-w-0 pr-4">
                        <div class="flex items-center gap-2 mb-1">
                          <h3 class="font-bold text-gray-900 truncate" title={repo.fullName}>{repo.name}</h3>
                          {repo.private && <span class="text-[10px] font-semibold bg-gray-100 text-gray-500 px-2 py-0.5 rounded">Privé</span>}
                        </div>
                        {repo.description && <p class="text-xs text-gray-500 truncate">{repo.description}</p>}
                        <div class="flex gap-3 mt-2 text-[10px] font-medium text-gray-400">
                          {repo.language && <span>{repo.language}</span>}
                          <span>MàJ: {new Date(repo.updatedAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                      
                      <button
                        onClick={() => handleImport(repo.cloneUrl, repo.name)}
                        disabled={importing !== null}
                        class={`shrink-0 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                          importing === repo.name 
                            ? 'bg-[#175B37]/10 text-[#175B37] cursor-wait' 
                            : 'bg-gray-50 text-gray-700 hover:bg-[#175B37] hover:text-white border border-gray-200 hover:border-[#175B37]'
                        }`}
                      >
                        {importing === repo.name ? 'Clonage...' : 'Importer'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
