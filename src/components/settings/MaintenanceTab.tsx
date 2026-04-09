type Props = {
  onSync: () => void;
  syncing: boolean;
  message: string;
};

export default function MaintenanceTab({ onSync, syncing, message }: Props) {
  return (
    <div class="p-6 space-y-6">
      <div>
        <p class="text-xs text-gray-500 mb-6">
          Actions pour resynchroniser les données physiques avec la base logicielle.
        </p>

        <div class="space-y-3">
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
            <button type="button" disabled class="shrink-0 px-4 py-2 rounded-full text-sm font-medium border border-gray-300 text-gray-400 opacity-40 cursor-not-allowed">
              Bientôt disponible
            </button>
          </div>
        </div>
      </div>

      {message && (
        <p class={`text-sm pt-4 border-t border-gray-200 font-medium ${message.includes('Erreur') ? 'text-red-500' : 'text-green-600'}`}>
          {message}
        </p>
      )}
    </div>
  );
}
