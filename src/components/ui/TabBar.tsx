type Tab = { id: string; label: string };

type Props = {
  tabs: Tab[];
  active: string;
  onChange: (id: string) => void;
  className?: string;
  /** `forge` : rail arrondi, onglet actif vert marque (#175B37) comme le reste du dashboard */
  tone?: 'neutral' | 'forge';
};

export default function TabBar({ tabs, active, onChange, className = '', tone = 'neutral' }: Props) {
  const isForge = tone === 'forge';
  const rail = isForge
    ? 'flex flex-wrap gap-1 p-1 bg-gray-100/90 rounded-full w-fit border border-gray-200/80 shadow-sm'
    : 'flex flex-wrap gap-1 p-1 bg-gray-100 rounded-xl w-fit';

  return (
    <div role="tablist" class={`${rail} ${className}`}>
      {tabs.map((tab) => {
        const selected = active === tab.id;
        const base =
          'font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-[#175B37]/40';
        const sizing = isForge ? 'px-4 py-2 text-xs rounded-full' : 'px-4 py-2 text-sm rounded-lg';
        const activeCls = isForge
          ? 'bg-white text-[#175B37] shadow-sm ring-1 ring-[#175B37]/15'
          : 'bg-white text-gray-900 shadow-sm';
        const idleCls = isForge
          ? 'text-gray-500 hover:text-gray-800 hover:bg-white/60'
          : 'text-gray-500 hover:text-gray-700';

        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={selected}
            type="button"
            onClick={() => onChange(tab.id)}
            class={`${base} ${sizing} ${selected ? activeCls : idleCls}`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
