export type DashProject = {
  id: number | string;
  name: string;
  status?: string | null;
  updatedAt?: string | null;
};

const ICONS = [
  { bg: 'bg-blue-100', text: 'text-blue-600' },
  { bg: 'bg-teal-100', text: 'text-teal-600' },
  { bg: 'bg-green-100', text: 'text-green-500' },
  { bg: 'bg-yellow-100', text: 'text-yellow-500' },
  { bg: 'bg-purple-100', text: 'text-purple-600' },
  { bg: 'bg-pink-100', text: 'text-pink-600' },
];

type Props = { projects: DashProject[] };

export default function DashProjectList({ projects }: Props) {
  const list = Array.isArray(projects) ? projects : [];

  return (
    <div class="bg-white p-6 rounded-[1.5rem] shadow-sm">
      <div class="flex justify-between items-center mb-4">
        <h3 class="font-semibold text-gray-800">Projet</h3>
        <a
          href="/apps"
          class="text-xs border border-gray-200 rounded-full px-3 py-1 flex items-center gap-1 text-gray-600 hover:bg-gray-50 transition-colors"
        >
          + Nouveau
        </a>
      </div>

      {list.length === 0 ? (
        <p class="text-sm text-gray-400 py-6 text-center">Aucun projet en base</p>
      ) : (
        <ul class="flex flex-col gap-4">
          {list.slice(0, 5).map((p, i) => {
            const color = ICONS[i % ICONS.length];
            const initial = p.name.charAt(0).toUpperCase();
            const dateStr = p.updatedAt
              ? new Date(p.updatedAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
              : null;

            return (
              <li key={String(p.id)}>
                <a href={`/apps/by-id/${p.id}`} class="flex items-center gap-3 no-underline group">
                  <div
                    class={`w-8 h-8 rounded-full ${color.bg} ${color.text} flex items-center justify-center font-bold text-xs shrink-0`}
                  >
                    {initial}
                  </div>
                  <div class="min-w-0">
                    <p class="text-sm font-semibold text-gray-800 group-hover:text-[#175B37] transition-colors truncate">
                      {p.name}
                    </p>
                    <p class="text-[10px] text-gray-400 truncate">
                      {dateStr ? `Mis à jour : ${dateStr}` : 'Actif'}
                    </p>
                  </div>
                </a>
              </li>
            );
          })}
        </ul>
      )}

      {list.length > 5 && (
        <a href="/apps" class="block text-xs text-[#175B37] hover:underline mt-4 text-center">
          Voir tous les projets →
        </a>
      )}
    </div>
  );
}
