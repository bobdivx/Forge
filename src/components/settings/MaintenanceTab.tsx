import { useState } from 'preact/hooks';

type Props = {
  onSync: () => void;
  syncing: boolean;
  message: string;
};

export default function MaintenanceTab({ onSync, syncing, message }: Props) {
  const [setupLoading, setSetupLoading] = useState(false);
  const [setupMsg, setSetupMsg] = useState('');

  const reopenSetupWizard = async () => {
    setSetupLoading(true);
    setSetupMsg('');
    try {
      const res = await fetch('/api/setup-wizard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'restart' }),
      });
      if (res.ok) {
        window.location.href = '/setup';
        return;
      }
      const d = await res.json().catch(() => ({}));
      setSetupMsg(String(d.error || 'Impossible de relancer l’assistant.'));
    } catch {
      setSetupMsg('Erreur réseau.');
    } finally {
      setSetupLoading(false);
    }
  };

  return (
    <div class="p-6 space-y-6">
      <div>
        <p class="text-xs text-gray-500 mb-6">
          Actions pour resynchroniser les données physiques avec la base logicielle.
        </p>

        <div class="space-y-3">
          <div class="bg-gray-50 border border-gray-200 rounded-xl p-4 flex items-center justify-between gap-4">
            <div class="min-w-0">
              <h4 class="text-sm font-medium text-gray-900">Assistant de configuration</h4>
              <p class="text-[10px] text-gray-400 mt-1">
                Rouvrir le guide (OpenClaw, dépôts, jetons). Utile après un changement de NAS ou de conteneurs.
              </p>
            </div>
            <button
              type="button"
              onClick={reopenSetupWizard}
              disabled={setupLoading}
              class="shrink-0 px-4 py-2 rounded-full text-sm font-medium border border-gray-300 bg-white text-gray-800 hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              {setupLoading ? 'Préparation…' : 'Relancer l’assistant'}
            </button>
          </div>

          {setupMsg && (
            <p class="text-sm text-red-600 border border-red-100 bg-red-50 rounded-lg px-3 py-2">{setupMsg}</p>
          )}

          <div class="bg-gray-50 border border-gray-200 rounded-xl p-4 flex items-center justify-between gap-4">
            <div class="min-w-0">
              <h4 class="text-sm font-medium text-gray-900">Synchronisation des projets</h4>
              <p class="text-[10px] text-gray-400 mt-1">
                Recherche les dépôts Git dans le dossier configuré et les ajoute à Astro DB.
              </p>
            </div>
            <button
              type="button"
              onClick={onSync}
              disabled={syncing}
              class="shrink-0 px-4 py-2 rounded-full text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              style="background:#175B37"
            >
              {syncing ? 'Synchronisation…' : 'Lancer la sync'}
            </button>
          </div>

          <div class="bg-gray-50 border border-gray-200 rounded-xl p-4 flex items-center justify-between gap-4">
            <div class="min-w-0">
              <h4 class="text-sm font-medium text-gray-900">Sauvegarde de la base de données</h4>
              <p class="text-[10px] text-gray-400 mt-1">
                Effectue une sauvegarde horodatée de la base Astro DB.
              </p>
            </div>
            <button
              type="button"
              disabled
              class="shrink-0 px-4 py-2 rounded-full text-sm font-medium border border-gray-300 text-gray-400 opacity-40 cursor-not-allowed"
            >
              Bientôt disponible
            </button>
          </div>
        </div>
      </div>

      {message && (
        <p
          class={`text-sm pt-4 border-t border-gray-200 font-medium ${message.includes('Erreur') ? 'text-red-500' : 'text-green-600'}`}
        >
          {message}
        </p>
      )}
    </div>
  );
}
