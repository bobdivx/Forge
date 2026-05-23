import { useEffect, useState } from 'preact/hooks';
import TabBar from '../ui/TabBar';
import PetTab from '../settings/PetTab';
import AgentToolsCatalog from '../settings/AgentToolsCatalog';

type Status = {
  running: boolean;
  intervalMinutes: number;
  lastRunAt: string | null;
  lastRunDurationMs: number | null;
  lastRunPrCount: number;
  lastRunError: string | null;
  nextRunAt: string | null;
};

const TABS = [
  { id: 'pet', label: 'Compagnon interactif (Pet Codex)' },
  { id: 'tools', label: 'MCP & Outils Custom' },
  { id: 'github', label: 'Watcher GitHub' },
];

export default function PluginsBoard() {
  const [activeTab, setActiveTab] = useState('pet');
  const [githubStatus, setGithubStatus] = useState<Status | null>(null);
  const [githubBusy, setGithubBusy] = useState(false);
  const [githubMessage, setGithubMessage] = useState('');

  const fetchGithubStatus = async () => {
    try {
      const res = await fetch('/api/agents/github/status');
      const data = await res.json();
      setGithubStatus(data.status);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    if (activeTab === 'github') {
      fetchGithubStatus();
      const id = setInterval(fetchGithubStatus, 15000);
      return () => clearInterval(id);
    }
  }, [activeTab]);

  const runGithubNow = async () => {
    setGithubBusy(true);
    setGithubMessage('');
    try {
      const res = await fetch('/api/agents/github/run-now', { method: 'POST' });
      const data = await res.json();
      setGithubMessage(
        data.ok
          ? `Scan terminé avec succès (${data.prCount} PRs analysées).`
          : `Échec : ${data.error || 'Erreur inconnue'}`
      );
      await fetchGithubStatus();
    } catch (e: any) {
      setGithubMessage(`Erreur réseau : ${e.message}`);
    } finally {
      setGithubBusy(false);
      setTimeout(() => setGithubMessage(''), 5000);
    }
  };

  const isRunningNow =
    githubStatus &&
    githubStatus.lastRunAt &&
    Date.now() - new Date(githubStatus.lastRunAt).getTime() < 60_000;

  return (
    <div class="space-y-6">
      <TabBar tabs={TABS} active={activeTab} onChange={setActiveTab} tone="forge" />

      <div class="bg-white border border-gray-100 rounded-[2rem] shadow-sm min-h-[400px] overflow-hidden">
        {activeTab === 'pet' && (
          <div>
            <div class="bg-gray-50/50 border-b border-gray-100 p-6">
              <h3 class="text-lg font-bold text-gray-900">Compagnon de Bureau</h3>
              <p class="text-xs text-gray-500 mt-1">
                Activez et personnalisez votre animal interactif (Clawd, Patamon, etc.) pour qu'il vous accompagne sur le tableau de bord et réagisse en direct aux tâches effectuées par vos agents.
              </p>
            </div>
            <PetTab />
          </div>
        )}

        {activeTab === 'tools' && (
          <div class="p-6 md:p-8">
            <div class="mb-6">
              <h3 class="text-lg font-bold text-gray-900">MCP & Outils système</h3>
              <p class="text-xs text-gray-500 mt-1">
                Gérez les capabilities de vos agents. Déclarez de nouveaux outils personnalisés (via exécutions de commandes templates ou connexions à des serveurs d'outils MCP) et affectez-les à vos agents.
              </p>
            </div>
            <AgentToolsCatalog />
          </div>
        )}

        {activeTab === 'github' && (
          <div class="p-6 md:p-8 space-y-6">
            <div class="flex flex-col gap-4 md:flex-row md:items-start md:justify-between border-b border-gray-100 pb-6">
              <div>
                <h3 class="text-lg font-bold text-gray-900">Daemon Watcher GitHub</h3>
                <p class="text-xs text-gray-500 mt-1 max-w-2xl">
                  Surveille de manière autonome les Pull Requests et issues sur l'ensemble de vos projets actifs pour les classifier automatiquement et créer des propositions de tâches si nécessaire.
                </p>
              </div>
              <div class="flex gap-2">
                <button
                  onClick={runGithubNow}
                  disabled={githubBusy}
                  class="rounded-xl bg-[#175B37] hover:bg-[#124a2c] text-white px-5 py-2.5 text-xs font-bold transition-all disabled:opacity-50"
                >
                  {githubBusy ? 'Scan en cours...' : 'Lancer un scan maintenant'}
                </button>
                <a
                  href="/agents/github"
                  class="rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 px-5 py-2.5 text-xs font-bold transition-all flex items-center justify-center"
                >
                  Tableau de bord GitHub →
                </a>
              </div>
            </div>

            {githubMessage && (
              <div class="p-3 bg-emerald-50 border border-emerald-100 text-emerald-800 rounded-xl text-xs">
                {githubMessage}
              </div>
            )}

            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div class="bg-gray-50 rounded-2xl border border-gray-150 p-5">
                <span class="text-[10px] font-black uppercase tracking-widest text-gray-400 block mb-2">Statut</span>
                <span
                  class={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold ${
                    githubStatus?.running
                      ? 'bg-blue-50 text-blue-700 border border-blue-200'
                      : isRunningNow
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : 'bg-gray-50 text-gray-600 border border-gray-200'
                  }`}
                >
                  <span
                    class={`h-2 w-2 rounded-full ${
                      githubStatus?.running ? 'bg-blue-500 animate-pulse' : 'bg-gray-400'
                    }`}
                  />
                  {githubStatus?.running ? 'Actif' : isRunningNow ? 'Veille (Dernier scan OK)' : 'Inactif'}
                </span>
              </div>
              <div class="bg-gray-50 rounded-2xl border border-gray-150 p-5">
                <span class="text-[10px] font-black uppercase tracking-widest text-gray-400 block mb-2">Intervalle</span>
                <span class="text-2xl font-bold text-gray-900">{githubStatus?.intervalMinutes ?? '—'}</span>
                <span class="text-xs text-gray-400 block mt-1">minutes entre scans</span>
              </div>
              <div class="bg-gray-50 rounded-2xl border border-gray-150 p-5">
                <span class="text-[10px] font-black uppercase tracking-widest text-gray-400 block mb-2">Dernière analyse</span>
                <span class="text-2xl font-bold text-gray-900">{githubStatus?.lastRunPrCount ?? 0}</span>
                <span class="text-xs text-gray-400 block mt-1">PR(s) détectée(s)</span>
              </div>
              <div class="bg-gray-50 rounded-2xl border border-gray-150 p-5">
                <span class="text-[10px] font-black uppercase tracking-widest text-gray-400 block mb-2">Prochain Scan</span>
                <span class="text-sm font-semibold text-gray-900 block mt-1">
                  {githubStatus?.nextRunAt ? new Date(githubStatus.nextRunAt).toLocaleTimeString() : 'Non planifié'}
                </span>
                {githubStatus?.lastRunError && (
                  <div class="text-[10px] text-rose-600 mt-2 truncate" title={githubStatus.lastRunError}>
                    Erreur : {githubStatus.lastRunError}
                  </div>
                )}
              </div>
            </div>
            
            <div class="bg-[#175B37]/5 border border-[#175B37]/10 rounded-2xl p-4 flex gap-3">
              <div class="bg-[#175B37]/20 p-2 rounded-lg h-fit text-[#175B37]">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <p class="text-xs text-gray-600 leading-relaxed">
                Le watcher utilise le jeton configuré dans <a href="/settings#api" class="font-bold underline hover:text-[#124a2c]">Paramètres → Jetons API</a>. Assurez-vous que le token GitHub possède les accès requis en lecture sur vos dépôts.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
