type Tab = { id: string; label: string };

type Props = {
  tabs: Tab[];
  active: string;
  onChange: (id: string) => void;
  className?: string;
};

export default function TabBar({ tabs, active, onChange, className = '' }: Props) {
  return (
    <div class={`flex flex-wrap gap-1 p-1 bg-slate-900 border border-slate-800 rounded-lg w-fit ${className}`}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          class={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
            active === tab.id
              ? 'bg-blue-600 text-white'
              : 'text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
