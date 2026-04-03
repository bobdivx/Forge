import { useState, useEffect } from 'preact/hooks';

interface Container {
  Names: string;
  State: string;
  Status: string;
  Image: string;
}

export default function ServiceHealthMonitor() {
  const [containers, setContainers] = useState<Container[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchHealth = async () => {
      try {
        const res = await fetch('/api/docker-health');
        const data = await res.json();
        if (data.containers) {
          setContainers(data.containers);
        }
        setLoading(false);
      } catch (e) {
        console.error("Failed to fetch docker health", e);
      }
    };

    fetchHealth();
    const interval = setInterval(fetchHealth, 60000); // Check every minute
    return () => clearInterval(interval);
  }, []);

  if (loading) return (
    <div class="px-4 py-6 border-t border-slate-800 animate-pulse">
      <div class="h-3 bg-slate-800 rounded w-1/3 mb-4"></div>
      <div class="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} class="flex justify-between items-center">
            <div class="w-1/2 h-2 bg-slate-800 rounded"></div>
            <div class="w-12 h-3 bg-slate-800 rounded-full"></div>
          </div>
        ))}
      </div>
    </div>
  );

  const getStatusBadge = (state: string) => {
    switch (state.toLowerCase()) {
      case 'running':
        return 'badge-success';
      case 'exited':
        return 'badge-error';
      case 'paused':
        return 'badge-warning';
      case 'created':
        return 'badge-info';
      default:
        return 'badge-ghost';
    }
  };

  // Select top 6 most relevant containers (maybe by age or just slice)
  const displayedContainers = containers.slice(0, 6);

  return (
    <div class="px-4 py-6 border-t border-slate-800">
      <h3 class="text-xs font-bold uppercase tracking-widest text-slate-500 mb-4 flex items-center gap-2">
        <span class="relative flex h-2 w-2">
          <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
          <span class="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
        </span>
        État Services
      </h3>
      
      <div class="space-y-3">
        {displayedContainers.map((c) => (
          <div key={c.Names} class="flex items-center justify-between gap-2">
            <div class="flex flex-col min-w-0">
              <span class="text-[11px] font-bold text-slate-300 truncate leading-tight" title={c.Names}>
                {c.Names.replace(/^\//, '')}
              </span>
              <span class="text-[9px] text-slate-500 truncate leading-tight" title={c.Image}>
                {c.Image.split('/').pop()}
              </span>
            </div>
            <div class={`badge badge-xs ${getStatusBadge(c.State)} font-bold p-1 text-[8px] h-3.5`}>
              {c.State.toUpperCase()}
            </div>
          </div>
        ))}
        {containers.length > 6 && (
          <div class="text-[9px] text-center text-slate-600 italic pt-1">
            + {containers.length - 6} autres conteneurs
          </div>
        )}
      </div>
    </div>
  );
}
