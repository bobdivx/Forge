import { useState, useEffect } from 'preact/hooks';
import type { JSX } from 'preact';

interface Project {
  id: number;
  name: string;
  description: string | null;
  path: string;
  status: string;
  swarmEnabled: number;
}

interface PM2Process {
  name: string;
  pm2_env: {
    status: string;
    env?: { PORT?: string };
  };
}

interface DockerContainer {
  Id: string;
  Names: string[];
  Image: string;
  State: string;
  Status: string;
  Ports: { PrivatePort: number; PublicPort?: number }[];
}

export default function DashboardAppCenter({ initialProjects }: { initialProjects: Project[] }) {
  const [projects, setProjects] = useState<Project[]>(initialProjects);
  const [pm2List, setPm2List] = useState<PM2Process[]>([]);
  const [dockerList, setDockerList] = useState<DockerContainer[]>([]);
  const [loadingApp, setLoadingApp] = useState<string | null>(null);
  const [activeDropdown, setActiveDropdown] = useState<number | null>(null);

  const fetchPM2Status = async () => {
    try {
      const res = await fetch('/api/pm2');
      if (res.ok) {
        const data = await res.json();
        setPm2List(data);
      }
    } catch (e) {
      console.error('Failed to fetch PM2 status', e);
    }
  };

  const fetchDockerStatus = async () => {
    try {
      const res = await fetch('/api/docker/containers');
      if (res.ok) {
        const data = await res.json();
        setDockerList(data);
      }
    } catch (e) {
      console.error('Failed to fetch Docker status', e);
    }
  };

  useEffect(() => {
    fetchPM2Status();
    fetchDockerStatus();
    const interval = setInterval(() => {
      fetchPM2Status();
      fetchDockerStatus();
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleAction = async (appName: string, action: string, path?: string) => {
    setLoadingApp(appName);
    try {
      let nextPort = 4332;
      if (action === 'start') {
        const usedPorts = pm2List.map(p => parseInt(p.pm2_env.env?.PORT || '0', 10)).filter(p => p > 0);
        if (usedPorts.length > 0) {
          nextPort = Math.max(...usedPorts) + 1;
        }
      }

      const res = await fetch('/api/pm2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          action, 
          appName, 
          scriptPath: path,
          env: action === 'start' ? { PORT: nextPort.toString(), HOST: '0.0.0.0' } : undefined
        }),
      });
      if (res.ok) {
        await fetchPM2Status();
      } else {
        const err = await res.json();
        alert(`Erreur: ${err.error}`);
      }
    } catch (e) {
      console.error(e);
      alert('Erreur serveur');
    } finally {
      setLoadingApp(null);
    }
  };

  const toggleSwarm = async (project: Project) => {
    const newStatus = project.swarmEnabled ? 0 : 1;
    try {
      const res = await fetch('/api/projects/toggle-swarm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: project.id, enabled: newStatus }),
      });
      if (res.ok) {
        setProjects(prev => prev.map(p => p.id === project.id ? { ...p, swarmEnabled: newStatus } : p));
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    const handleClick = () => setActiveDropdown(null);
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  return (
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {projects.map((project) => {
        const process = pm2List.find((p) => {
          const pName = p.name.toLowerCase();
          const projName = project.name.toLowerCase();
          const projDir = (project.path || '').split('/').pop()?.toLowerCase();
          return pName === projName || pName === projDir || pName.startsWith(projName + '-') || (projDir && pName.startsWith(projDir + '-')) || (projName === 'forge' && pName.includes('forge'));
        });
        
        const dockerContainer = dockerList.find((c) => {
          const cName = c.Names[0].replace('/', '').toLowerCase();
          const projName = project.name.toLowerCase();
          const projDir = (project.path || '').split('/').pop()?.toLowerCase();
          return cName === projName || cName === projDir || cName.startsWith(projName + '-') || (projDir && cName.startsWith(projDir + '-')) || (projName === 'forge' && cName.includes('forge'));
        });

        const isOnline = process?.pm2_env?.status === 'online';
        const port = process?.pm2_env?.env?.PORT || 'Inconnu';
        
        const isDockerOnline = dockerContainer?.State === 'running';
        const dockerPort = isDockerOnline && dockerContainer.Ports?.find(p => p.PublicPort)?.PublicPort;
        
        const isLoading = loadingApp === project.name;

        return (
          <div 
            key={project.id} 
            class="group flex flex-col overflow-hidden rounded-[1.5rem] border border-gray-200 bg-white shadow-sm transition-all hover:shadow-lg hover:border-[#175B37]/30 relative cursor-default"
          >
            {/* Clickable Overlay to app page */}
            <a 
              href={`/apps/by-id/${project.id}`} 
              class="absolute inset-0 z-0" 
              aria-label={`Ouvrir ${project.name}`}
            />

            <div class="absolute top-4 right-4 flex flex-col items-end gap-1 z-10">
              {dockerContainer && (
                <>
                  <a href="/docker" class="bg-[#1d4ed8] text-white text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 shadow-sm hover:bg-[#1e40af] transition-colors" title="Production Docker détectée">
                    <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M13.98 23.315c-.477.106-1.12.164-1.92.164-3.666 0-6.198-1.077-7.618-3.238-.636-.976-.95-2.18-.95-3.61v-2.315H.725A.728.728 0 0 1 0 13.59v-1.785a.728.728 0 0 1 .725-.726h2.766v-1.391C3.491 5.926 5.86 3.655 9.713 3.655h4.267a.728.728 0 0 1 .725.727v1.785a.728.728 0 0 1-.725.725H9.713c-2.302 0-3.644 1.34-3.644 3.796v1.391h7.911A.728.728 0 0 1 14.706 12.8v1.785a.728.728 0 0 1-.725.726H6.069v2.315c0 1.947 1.488 2.825 4.542 2.825.862 0 1.583-.064 2.158-.182a.728.728 0 0 1 .862.548l.459 1.638a.728.728 0 0 1-.53.94l.42.08Z"/></svg>
                    Prod: {isDockerOnline ? 'Actif' : 'Arrêté'}
                  </a>
                  {dockerPort && (
                    <a href={`http://zimacube.local:${dockerPort}`} target="_blank" class="text-[10px] font-medium text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100 hover:bg-blue-100" onClick={e => e.stopPropagation()}>
                      :{dockerPort}
                    </a>
                  )}
                </>
              )}
            </div>
            
            <div class="p-6 flex-1 pt-6 relative z-0">
              <div class="flex justify-between items-start mb-4">
                <div class="flex items-center gap-3">
                  <div class="h-12 w-12 rounded-full flex items-center justify-center font-bold text-xl text-white shrink-0 shadow-sm" style="background:#175B37">
                    {project.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h3 class="text-lg font-bold text-gray-900 leading-tight pr-12 group-hover:text-[#175B37] transition-colors">
                      {project.name}
                    </h3>
                    <div class="flex items-center gap-2 mt-1">
                      <span class={`w-2 h-2 rounded-full ${isOnline ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-gray-300'}`}></span>
                      <span class="text-xs text-gray-500 uppercase tracking-wide">
                        {isOnline ? 'Dev: En ligne' : 'Dev: Stoppé'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <p class="text-sm text-gray-600 line-clamp-2 h-10 mb-4">
                {project.description || "Aucune description fournie."}
              </p>

              <div class="flex flex-col gap-2">
                {isOnline && port !== 'Inconnu' && (
                  <div class="bg-[#E9F3EB] rounded-xl p-3 flex flex-col gap-2 relative z-10">
                    <div class="flex items-center justify-between">
                      <div class="flex items-center gap-2">
                        <svg class="w-4 h-4 text-[#175B37]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                        </svg>
                        <a href={`http://zimacube.local:${port}`} target="_blank" class="text-[13px] font-bold text-[#175B37] hover:underline" onClick={e => e.stopPropagation()}>
                          zimacube.local:${port} (Dev)
                        </a>
                      </div>
                      <button 
                        onClick={async (e) => {
                          e.stopPropagation();
                          const btn = document.getElementById('cf-btn-' + project.id);
                          if(btn) btn.innerHTML = '<div class="w-3 h-3 border-2 border-[#175B37]/30 border-t-[#175B37] rounded-full animate-spin"></div>';
                          try {
                            const res = await fetch('/api/cloudflare-tunnel', {
                              method: 'POST',
                              headers: {'Content-Type':'application/json'},
                              body: JSON.stringify({ appName: project.path.split('/').pop() || project.name, action: 'publish' })
                            });
                            const data = await res.json();
                            if(data.error) alert(data.error);
                            else {
                              alert('Demande de Tunnel envoyée !\nURL cible: ' + data.url);
                            }
                          } catch(e) { alert('Erreur serveur'); }
                          if(btn) btn.innerHTML = 'Publier';
                        }}
                        id={`cf-btn-${project.id}`}
                        class="text-[10px] font-semibold bg-white text-[#175B37] border border-[#175B37]/20 px-2 py-1 rounded hover:bg-[#175B37] hover:text-white transition-colors"
                        title="Exposer sur Internet via Cloudflare"
                      >
                        Publier
                      </button>
                    </div>
                  </div>
                )}

                <button 
                  onClick={(e) => { e.stopPropagation(); toggleSwarm(project); }}
                  class={`relative z-10 flex items-center justify-between p-3 rounded-xl border transition-all ${project.swarmEnabled ? 'bg-amber-50 border-amber-200' : 'bg-gray-50 border-gray-200 opacity-70 hover:opacity-100'}`}
                >
                  <div class="flex items-center gap-3">
                    <div class={`w-8 h-8 rounded-full flex items-center justify-center text-lg ${project.swarmEnabled ? 'bg-amber-100 text-amber-600' : 'bg-gray-200 text-gray-500'}`}>
                      🤖
                    </div>
                    <div class="text-left">
                      <p class={`text-xs font-bold ${project.swarmEnabled ? 'text-amber-900' : 'text-gray-700'}`}>Agents au travail</p>
                      <p class="text-[10px] text-gray-500">{project.swarmEnabled ? 'Le swarm est actif sur ce projet' : 'Agents en pause'}</p>
                    </div>
                  </div>
                  <div class={`w-10 h-5 rounded-full relative transition-colors ${project.swarmEnabled ? 'bg-amber-500' : 'bg-gray-300'}`}>
                    <div class={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${project.swarmEnabled ? 'right-1' : 'left-1'}`} />
                  </div>
                </button>
              </div>
            </div>

            <div class="border-t border-gray-100 p-4 bg-gray-50 flex gap-3 relative z-10">
              {isOnline ? (
                <>
                  <button 
                    onClick={(e) => { e.stopPropagation(); handleAction(process.name, 'restart'); }}
                    disabled={isLoading}
                    class="flex-1 bg-white border border-gray-200 text-gray-700 py-2 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Redémarrer
                  </button>
                  <button 
                    onClick={(e) => { e.stopPropagation(); handleAction(process.name, 'stop'); }}
                    disabled={isLoading}
                    class="flex-1 bg-red-50 border border-red-100 text-red-600 py-2 rounded-xl text-sm font-medium hover:bg-red-100 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
                    </svg>
                    Arrêter
                  </button>
                </>
              ) : (
                <div class="relative w-full flex">
                  <button 
                    onClick={(e) => { e.stopPropagation(); handleAction(project.path.split('/').pop() || project.name, 'start', project.path); }}
                    disabled={isLoading}
                    class="flex-1 bg-[#175B37] text-white py-2.5 rounded-l-xl text-sm font-medium hover:bg-[#134d2e] transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {isLoading ? (
                      <div class="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    ) : (
                      <>
                        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Démarrer (Dev)
                      </>
                    )}
                  </button>
                  <div class="relative">
                    <button 
                      class="px-3 bg-[#134d2e] text-white rounded-r-xl border-l border-white/20 hover:bg-[#0f3d24] transition-colors h-full flex items-center justify-center disabled:opacity-50"
                      disabled={isLoading}
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveDropdown(activeDropdown === project.id ? null : project.id);
                      }}
                    >
                      <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" /></svg>
                    </button>
                    {activeDropdown === project.id && (
                      <div class="absolute bottom-full right-0 mb-2 w-48 bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden z-20">
                        <button 
                          onClick={(e) => { e.stopPropagation(); setActiveDropdown(null); handleAction(project.path.split('/').pop() || project.name, 'start_prod', project.path); }}
                          class="w-full text-left px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 hover:text-[#175B37] font-medium transition-colors"
                        >
                          🚀 Démarrer (Prod)
                        </button>
                        <button 
                          onClick={(e) => { e.stopPropagation(); setActiveDropdown(null); handleAction(project.path.split('/').pop() || project.name, 'start', project.path); }}
                          class="w-full text-left px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 hover:text-[#175B37] font-medium transition-colors border-t border-gray-50"
                        >
                          🛠️ Démarrer (Dev)
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
