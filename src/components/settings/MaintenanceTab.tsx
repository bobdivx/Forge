type Props = {
  onSync: () => void;
  syncing: boolean;
  message: string;
};

export default function MaintenanceTab({ onSync, syncing, message }: Props) {
  return (
    <div class="p-6 space-y-6">
      <div>
        <p class="text-xs text-slate-400 mb-6">
          Actions pour resynchroniser les données physiques avec la base logicielle.
        </p>

        <div class="space-y-3">
          <div class="bg-slate-950 border border-slate-800 rounded-lg p-4 flex items-center justify-between gap-4">
            <div class="min-w-0">
              <h4 class="text-sm font-medium text-white">Synchronisation des projets</h4>
              <p class="text-[10px] text-slate-500 mt-1">
                Recherche les dépôts Git dans le dossier configuré et les ajoute à Astro DB.
              </p>
            </div>
            <button
              type="button"
              onClick={onSync}
              disabled={syncing}
              class={`btn btn-outline btn-sm shrink-0 ${syncing ? 'loading' : ''}`}
            >
              {syncing ? 'Synchronisation…' : 'Lancer la sync'}
            </button>
          </div>

          <div class="bg-slate-950 border border-slate-800 rounded-lg p-4 flex items-center justify-between gap-4">
            <div class="min-w-0">
              <h4 class="text-sm font-medium text-white">Sauvegarde de la base de données</h4>
              <p class="text-[10px] text-slate-500 mt-1">
                Effectue une sauvegarde horodatée de la base Astro DB.
              </p>
            </div>
            <button type="button" disabled class="btn btn-outline btn-sm shrink-0 opacity-40">
              Bientôt disponible
            </button>
          </div>
        </div>
      </div>

      {message && (
        <p class={`text-sm pt-2 border-t border-slate-800 ${message.includes('Erreur') ? 'text-red-400' : 'text-emerald-400'}`}>
          {message}
        </p>
      )}
    </div>
  );
}
