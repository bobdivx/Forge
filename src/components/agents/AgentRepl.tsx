import { useState, useEffect, useRef } from 'preact/hooks';
import { getSuggestions, FORGE_COMMANDS, type CommandDef } from '../../lib/forge-commands';

// ── Types ─────────────────────────────────────────────────────────────────────

type EntryType = 'cmd' | 'output' | 'error' | 'info' | 'welcome';

type HistoryEntry = {
  id: number;
  type: EntryType;
  content: string;
  ts: string;
};

let _counter = 0;
const uid = () => ++_counter;

const nowHMS = () =>
  new Date().toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

const WELCOME: HistoryEntry[] = [
  {
    id: uid(),
    type: 'welcome',
    content:
      'Forge REPL v1.0  —  /help pour les commandes  ·  Tab pour compléter  ·  ↑↓ pour l\'historique',
    ts: '',
  },
];

// ── Component ─────────────────────────────────────────────────────────────────

export default function AgentRepl() {
  const [agentId, setAgentId] = useState('forge');
  const [agents, setAgents] = useState<string[]>(['forge']);
  const [history, setHistory] = useState<HistoryEntry[]>(WELCOME);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<CommandDef[]>([]);
  const [cmdHistory, setCmdHistory] = useState<string[]>([]);
  const [histIdx, setHistIdx] = useState(-1);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Charger la liste des agents pour le sélecteur
  useEffect(() => {
    fetch('/api/agents')
      .then((r) => r.json())
      .then(({ agents: list }) => {
        const ids: string[] = ['forge'];
        for (const a of list ?? []) {
          if (a.id && !ids.includes(a.id)) ids.push(a.id);
        }
        setAgents(ids.slice(0, 30));
      })
      .catch(() => {});
  }, []);

  // Auto-scroll vers le bas à chaque nouvelle entrée
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history]);

  const push = (type: EntryType, content: string) =>
    setHistory((h) => [...h, { id: uid(), type, content, ts: nowHMS() }]);

  // ── Input handling ──────────────────────────────────────────────────────────

  const handleInput = (val: string) => {
    setInput(val);
    setHistIdx(-1);
    if (val.startsWith('/') && !val.includes(' ')) {
      setSuggestions(getSuggestions(val));
    } else {
      setSuggestions([]);
    }
  };

  const pickSuggestion = (name: string) => {
    setInput(`/${name} `);
    setSuggestions([]);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const submit = async () => {
    const cmd = input.trim();
    if (!cmd || loading) return;

    setCmdHistory((h) => [cmd, ...h.slice(0, 99)]);
    setInput('');
    setSuggestions([]);
    push('cmd', cmd);

    // /clear est géré côté client
    if (cmd === '/clear') {
      setHistory([
        { id: uid(), type: 'info', content: 'Terminal effacé.', ts: nowHMS() },
      ]);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/agent-repl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: cmd, agentId }),
      });
      const data = await res.json();
      push(data.ok ? 'output' : 'error', data.output ?? data.error ?? 'Erreur inconnue');
    } catch (e: any) {
      push('error', `Erreur réseau: ${e.message}`);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submit();
    } else if (e.key === 'Tab' && suggestions.length > 0) {
      e.preventDefault();
      pickSuggestion(suggestions[0].name);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const idx = Math.min(histIdx + 1, cmdHistory.length - 1);
      setHistIdx(idx);
      if (idx >= 0) setInput(cmdHistory[idx]);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const idx = Math.max(histIdx - 1, -1);
      setHistIdx(idx);
      setInput(idx >= 0 ? cmdHistory[idx] : '');
    } else if (e.key === 'Escape') {
      setSuggestions([]);
      setInput('');
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div
      class="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden flex flex-col shadow-2xl"
      style={{ height: '540px' }}
      onClick={() => inputRef.current?.focus()}
    >
      {/* ── Barre de titre macOS-style ───────────────────────────────────── */}
      <div class="flex items-center gap-3 px-4 py-2.5 bg-[#0d1117] border-b border-slate-800 shrink-0 select-none">
        <div class="flex gap-1.5">
          <div
            class="w-3 h-3 rounded-full bg-rose-500/80 hover:bg-rose-400 cursor-pointer transition-colors"
            title="Effacer"
            onClick={(e) => {
              e.stopPropagation();
              setHistory([
                { id: uid(), type: 'info', content: 'Terminal effacé.', ts: nowHMS() },
              ]);
            }}
          />
          <div class="w-3 h-3 rounded-full bg-amber-500/60" />
          <div class="w-3 h-3 rounded-full bg-emerald-500/60" />
        </div>

        <span class="text-[11px] font-mono text-slate-500 flex-1 text-center">
          forge-repl
        </span>

        {/* Sélecteur d'agent */}
        <div class="flex items-center gap-2">
          <span class="text-[10px] text-slate-600 uppercase tracking-wider">
            ctx
          </span>
          <select
            value={agentId}
            onChange={(e) => setAgentId((e.target as HTMLSelectElement).value)}
            class="select select-xs bg-slate-900 border-slate-700 text-slate-300 font-mono text-[11px] h-6 min-h-0 w-44 focus:outline-none focus:border-violet-500/50"
            onClick={(e) => e.stopPropagation()}
          >
            {agents.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>

        {/* Indicateur d'activité */}
        <div
          class={`w-2 h-2 rounded-full transition-colors ${
            loading ? 'bg-amber-400 animate-pulse' : 'bg-emerald-500/60'
          }`}
          title={loading ? 'Exécution…' : 'Prêt'}
        />
      </div>

      {/* ── Sortie scrollable ───────────────────────────────────────────── */}
      <div class="flex-1 overflow-y-auto px-4 py-3 font-mono text-[12px] leading-relaxed space-y-0.5">
        {history.map((entry) => (
          <ReplLine key={entry.id} entry={entry} agentId={agentId} />
        ))}

        {loading && (
          <div class="flex items-center gap-2 text-amber-400/60 py-0.5">
            <span class="loading loading-dots loading-xs" />
            <span class="text-[11px]">exécution…</span>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* ── Suggestions ────────────────────────────────────────────────── */}
      {suggestions.length > 0 && (
        <div
          class="bg-[#0d1117] border-t border-slate-800 px-4 py-2 flex flex-wrap gap-1.5 shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
          {suggestions.map((s) => (
            <button
              key={s.name}
              type="button"
              onClick={() => pickSuggestion(s.name)}
              class="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-800 text-emerald-300 hover:bg-slate-700 border border-slate-700 hover:border-emerald-500/40 transition-colors"
            >
              <span class="text-violet-400">/{s.name}</span>
              <span class="text-slate-500 ml-1">— {s.description}</span>
            </button>
          ))}
          <span class="text-[10px] text-slate-600 self-center ml-1">Tab ↵</span>
        </div>
      )}

      {/* ── Ligne de saisie ────────────────────────────────────────────── */}
      <div
        class="flex items-center gap-2 px-4 py-2.5 bg-[#0d1117] border-t border-slate-800 shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <span class="font-mono text-[12px] select-none shrink-0">
          <span class="text-violet-400">forge</span>
          <span class="text-slate-600">:</span>
          <span class="text-cyan-400">{agentId}</span>
          <span class="text-slateald-600 text-emerald-400">$</span>
        </span>

        <input
          ref={inputRef}
          type="text"
          value={input}
          onInput={(e) => handleInput((e.target as HTMLInputElement).value)}
          onKeyDown={handleKeyDown}
          placeholder="/help"
          disabled={loading}
          class="flex-1 bg-transparent border-none outline-none font-mono text-[12px] text-emerald-300 placeholder-slate-700 disabled:opacity-40 caret-emerald-400"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
        />

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            submit();
          }}
          disabled={loading || !input.trim()}
          class="shrink-0 text-slate-600 hover:text-emerald-400 transition-colors disabled:opacity-20 p-1 rounded"
          title="Exécuter (Entrée)"
        >
          <svg
            class="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M13 9l3 3m0 0l-3 3m3-3H8m13 0a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}

// ── Sous-composant ReplLine ────────────────────────────────────────────────────

function ReplLine({
  entry,
  agentId,
}: {
  entry: HistoryEntry;
  agentId: string;
}) {
  const { type, content, ts } = entry;

  if (type === 'welcome') {
    return (
      <div class="text-slate-500 text-[11px] py-0.5 border-b border-slate-800/50 mb-2">
        {content}
      </div>
    );
  }

  if (type === 'info') {
    return (
      <div class="flex gap-2 items-start py-0.5">
        {ts && <span class="text-slate-700 text-[10px] mt-0.5 shrink-0 w-16">{ts}</span>}
        <span class="text-blue-400/70">{content}</span>
      </div>
    );
  }

  if (type === 'cmd') {
    return (
      <div class="flex gap-2 items-start py-1">
        {ts && <span class="text-slate-700 text-[10px] mt-0.5 shrink-0 w-16">{ts}</span>}
        <div class="flex items-start gap-1.5 flex-wrap">
          <span class="text-slate-600 shrink-0">
            <span class="text-violet-400">forge</span>
            <span class="text-slate-700">:</span>
            <span class="text-cyan-400">{agentId}</span>
            <span class="text-emerald-400">$</span>
          </span>
          <span class="text-white/90 break-all">{content}</span>
        </div>
      </div>
    );
  }

  if (type === 'error') {
    return (
      <div class="flex gap-2 items-start py-0.5">
        {ts && <span class="text-slate-700 text-[10px] mt-0.5 shrink-0 w-16">{ts}</span>}
        <pre class="text-rose-400 whitespace-pre-wrap break-words">{content}</pre>
      </div>
    );
  }

  // type === 'output'
  return (
    <div class="flex gap-2 items-start py-0.5">
      {ts && <span class="text-slate-700 text-[10px] mt-0.5 shrink-0 w-16">{ts}</span>}
      <pre class="text-slate-300 whitespace-pre-wrap break-words leading-relaxed text-[11.5px]">
        {content}
      </pre>
    </div>
  );
}
