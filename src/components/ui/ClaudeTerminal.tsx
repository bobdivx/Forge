import { useState, useRef, useEffect } from 'preact/hooks';

export function ClaudeTerminal({ defaultCwd = '/' }: { defaultCwd?: string }) {
  const [prompt, setPrompt] = useState('');
  const [output, setOutput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [cwd, setCwd] = useState(defaultCwd);
  const [models, setModels] = useState<{id: string, name: string}[]>([]);
  const [selectedModel, setSelectedModel] = useState('');
  const terminalRef = useRef<HTMLPreElement>(null);

  // Auto-scroll au bas du terminal quand l'output change
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [output]);

  // Charger les modèles Ollama/OpenClaw au démarrage
  useEffect(() => {
    const fetchModels = async () => {
      try {
        const res = await fetch('/api/models');
        if (res.ok) {
          const data = await res.json();
          // On filtre potentiellement pour ne garder que ceux pertinents (ex: Ollama)
          // ou on affiche tout le catalogue récupéré via OpenClaw
          setModels(data);
          
          // Essayer de pré-sélectionner un modèle GLM ou Qwen s'il existe
          const defaultModel = data.find((m: any) => m.name.toLowerCase().includes('glm') || m.name.toLowerCase().includes('coder'));
          if (defaultModel) {
            setSelectedModel(defaultModel.name.replace('openclaw/', ''));
          } else if (data.length > 0) {
            setSelectedModel(data[0].name.replace('openclaw/', ''));
          }
        }
      } catch (err) {
        console.error("Erreur chargement modèles:", err);
      }
    };
    fetchModels();
  }, []);

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    if (!prompt.trim()) return;

    setIsLoading(true);
    // Nettoyer l'ID si ça vient de l'API avec le préfixe openclaw/
    const cleanModelName = selectedModel.replace('openclaw/', '');
    setOutput(prev => prev + `\n$ claude-code -p "${prompt}" [Modèle: ${cleanModelName}]\n`);
    
    try {
      const response = await fetch('/api/claude-local', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, cwd, model: cleanModelName })
      });

      if (!response.body) throw new Error("Pas de flux de réponse");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const textChunk = decoder.decode(value);
        setOutput(prev => prev + textChunk);
      }
    } catch (err: any) {
      setOutput(prev => prev + `\n[Erreur: ${err.message}]\n`);
    } finally {
      setIsLoading(false);
      setPrompt('');
    }
  };

  return (
    <div className="flex flex-col bg-base-300 rounded-lg overflow-hidden border border-base-content/10 shadow-lg">
      <div className="bg-base-200 px-4 py-2 flex items-center justify-between text-sm text-base-content/70 border-b border-base-content/10">
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-error"></span>
          <span className="w-3 h-3 rounded-full bg-warning"></span>
          <span className="w-3 h-3 rounded-full bg-success"></span>
        </div>
        <div className="font-mono text-xs flex items-center gap-2">
          Claude Code
          {models.length > 0 && (
            <select 
              className="select select-ghost select-xs bg-base-300 ml-2" 
              value={selectedModel}
              onChange={(e) => setSelectedModel((e.target as HTMLSelectElement).value)}
              disabled={isLoading}
            >
              {models.map(m => (
                <option key={m.id} value={m.name}>{m.name}</option>
              ))}
            </select>
          )}
        </div>
      </div>
      
      <pre 
        ref={terminalRef}
        className="p-4 h-96 overflow-y-auto font-mono text-sm bg-[#1e1e1e] text-[#d4d4d4] whitespace-pre-wrap"
      >
        {output || 'Prêt. Entrez un prompt pour lancer Claude Code en local.\n'}
      </pre>

      <form onSubmit={handleSubmit} className="p-2 bg-base-200 flex gap-2 border-t border-base-content/10">
        <div className="flex-1 flex flex-col gap-2">
          <input 
            type="text" 
            placeholder="Dossier cible (cwd) ex: /mnt/GitHub/MonProjet" 
            className="input input-sm input-bordered w-full font-mono text-xs" 
            value={cwd}
            onChange={(e) => setCwd((e.target as HTMLInputElement).value)}
            disabled={isLoading}
          />
          <input 
            type="text" 
            placeholder="Que voulez-vous demander à Claude ?" 
            className="input input-bordered w-full" 
            value={prompt}
            onChange={(e) => setPrompt((e.target as HTMLInputElement).value)}
            disabled={isLoading}
          />
        </div>
        <button 
          type="submit" 
          className="btn btn-primary self-end h-full"
          disabled={isLoading || !prompt.trim()}
        >
          {isLoading ? <span className="loading loading-spinner loading-sm"></span> : 'Envoyer'}
        </button>
      </form>
    </div>
  );
}
