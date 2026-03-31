import { useEffect, useState } from 'preact/hooks';

const initialLines = [
  '[CHEF_TECHNIQUE] Initialisation de la Forge... OK',
  '[SYSTEME] Daemon OpenClaw connecté.',
  '[OLLAMA] Modèle qwen2.5:32b chargé avec succès (VRAM OK).',
  '[GITHUB] Auth CLI validée (mathieu@forge).',
  '[ARCHITECTE_LOGICIEL] Structure des agents synchronisée.',
  '[INFRA_TECH] Daemon Docker ZimaOS joignable.',
  '[ROUTINE] Scan de /media/GitHub... 4 dépôts trouvés.'
];

export default function WireLogs() {
  const [lines, setLines] = useState<string[]>(initialLines);

  // Simulation de nouveaux logs pour l'effet "vivant"
  useEffect(() => {
    const timer = setInterval(() => {
      const mockEvents = [
        '[VEILLE_TECH] Vérification des dépendances NPM terminées.',
        '[MAINTENANCE_REPO] Aucune PR en attente.',
        '[TESTEUR_QA] Scan qualité des répertoires en cours...',
        '[SECURITE_CODE] Audit de tesla.forge.local terminé. 0 faille.',
        '[CHEF_TECHNIQUE] En attente de nouvelles instructions.'
      ];
      if (Math.random() > 0.7) {
        setLines(prev => [...prev.slice(-15), mockEvents[Math.floor(Math.random() * mockEvents.length)]]);
      }
    }, 4000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div class="bg-slate-950 rounded-xl border border-slate-800 shadow-xl overflow-hidden flex flex-col h-[300px]">
      <div class="flex items-center justify-between px-4 py-2.5 bg-slate-900 border-b border-slate-800">
        <div class="flex items-center gap-2">
          <svg class="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <h2 class="text-xs font-semibold tracking-wider text-slate-300 uppercase">The Wire - Flux Temps Réel</h2>
        </div>
        <div class="flex gap-1.5">
          <div class="w-2.5 h-2.5 rounded-full bg-slate-700"></div>
          <div class="w-2.5 h-2.5 rounded-full bg-slate-700"></div>
          <div class="w-2.5 h-2.5 rounded-full bg-slate-700"></div>
        </div>
      </div>
      
      <div class="flex-1 p-4 font-mono text-[11px] overflow-y-auto bg-[#0A0D14] text-slate-300 custom-scrollbar flex flex-col gap-1.5">
        {lines.map((line, i) => {
          let colorClass = "text-slate-400";
          if (line.includes('[CHEF_TECHNIQUE]')) colorClass = "text-blue-400";
          if (line.includes('[OLLAMA]')) colorClass = "text-emerald-400";
          if (line.includes('[GITHUB]')) colorClass = "text-purple-400";
          if (line.includes('[SECURITE_CODE]')) colorClass = "text-red-400";
          if (line.includes('OK') || line.includes('succès')) colorClass = "text-emerald-400";

          return (
            <div key={i} class="flex items-start gap-3 hover:bg-slate-800/50 px-2 py-0.5 rounded transition">
              <span class="text-slate-600 shrink-0 select-none">
                {new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
              <span class={`${colorClass} break-words`}>{line}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
