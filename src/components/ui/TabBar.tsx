type Tab = { id: string; label: string };

type Props = {
  tabs: Tab[];
  active: string;
  onChange: (id: string) => void;
  className?: string;
};

export default function TabBar({ tabs, active, onChange, className = '' }: Props) {
  return (
    <div class={`flex flex-wrap gap-1 p-1 bg-gray-100 rounded-xl w-fit ${className}`}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          class={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
            active === tab.id
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
