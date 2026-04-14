import { useState } from 'preact/hooks';

interface Props {
  projectId: number;
  initialState: boolean;
}

export default function ProjectSwarmToggle({ projectId, initialState }: Props) {
  const [enabled, setEnabled] = useState(initialState);
  const [loading, setLoading] = useState(false);

  const handleToggle = async (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (loading) return;

    setLoading(true);
    const nextState = !enabled;

    try {
      const resp = await fetch('/api/projects/toggle-swarm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: projectId, enabled: nextState }),
      });

      if (resp.ok) {
        setEnabled(nextState);
      } else {
        console.error('Échec de la bascule Swarm');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div 
      class="flex items-center gap-2"
      onClick={handleToggle}
      title={enabled ? "Désactiver l'autonomie du Swarm" : "Activer l'autonomie du Swarm"}
    >
      <span class="text-[10px] font-bold text-gray-400 uppercase tracking-tighter">Swarm</span>
      <button
        type="button"
        disabled={loading}
        class={`
          relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent 
          transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-[#3BAE61] focus:ring-offset-1
          ${enabled ? 'bg-[#3BAE61]' : 'bg-gray-200'}
          ${loading ? 'opacity-50 cursor-wait' : ''}
        `}
      >
        <span
          aria-hidden="true"
          class={`
            pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 
            transition duration-200 ease-in-out
            ${enabled ? 'translate-x-4' : 'translate-x-0'}
          `}
        />
      </button>
    </div>
  );
}
