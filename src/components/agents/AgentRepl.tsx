import { useState, useEffect, useRef } from 'preact/hooks';
import { getSuggestions, type CommandDef } from '../../lib/forge-commands';

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
      "Forge REPL v1.0  —  /help pour les commandes  ·  Tab pour compléter  ·  ↑↓ pour l'historique",
    ts: '',
  },
];

const FORGE = '#175B37';
const FORGE_MUTED = '#3BAE61';

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

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history]);

  const push = (type: EntryType, content: string) =>
    setHistory((h) => [...h, { id: uid(), type, content, ts: nowHMS() }]);

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

    if (cmd === '/clear') {
      setHistory([{ id: uid(), type: 'info', content: 'Terminal effacé.', ts: nowHMS() }]);
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

  return (
    <div
      class="bg-white border border-gray-100 rounded-[1.5rem] shadow-sm overflow-hidden flex flex-col"
      style={{ height: '540px' }}
      onClick={() => inputRef.current?.focus()}
    >
      {/* En-tête (même langage que les cartes agents / apps) */}
      <div class="flex items-center gap-3 px-4 py-3 bg-gray-50/90 border-b border-gray-100 shrink-0 select-none">
        <div class="flex gap-1.5 items-center">
          <button
            type="button"
            title="Effacer"
            class="w-3 h-3 rounded-full bg-gray-300 hover:bg-rose-400 transition-colors border border-gray-200"
            onClick={(e) => {
              e.stopPropagation();
              setHistory([{ id: uid(), type: 'info', content: 'Terminal effacé.', ts: nowHMS() }]);
            }}
          />
          <span class="w-3 h-3 rounded-full bg-gray-200 border border-gray-200" />
          <span class="w-3 h-3 rounded-full border" style={{ background: FORGE_MUTED, borderColor: `${FORGE}33` }} />
        </div>

        <span class="text-[10px] font-bold text-gray-400 uppercase tracking-widest flex-1 text-center font-sans">
          Console Forge
        </span>

        <div class="flex items-center gap-2">
          <span class="text-[10px] text-gray-400 uppercase tracking-wider hidden sm:inline">Contexte</span>
          <select
            value={agentId}
            onChange={(e) => setAgentId((e.target as HTMLSelectElement).value)}
            class="rounded-full border border-gray-200 bg-white text-gray-800 font-mono text-[11px] h-8 px-2.5 max-w-[10rem] sm:max-w-[12rem] focus:outline-none focus:ring-2 focus:ring-[#175B37]/25 focus:border-[#175B37]/40"
            onClick={(e) => e.stopPropagation()}
          >
            {agents.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>

        <div
          class={`w-2 h-2 rounded-full shrink-0 transition-colors ${
            loading ? 'bg-amber-400 animate-pulse' : ''
          }`}
          style={!loading ? { background: FORGE_MUTED } : undefined}
          title={loading ? 'Exécution…' : 'Prêt'}
        />
      </div>

      <div class="flex-1 overflow-y-auto px-4 py-3 font-mono text-[12px] leading-relaxed space-y-0.5 bg-white">
        {history.map((entry) => (
          <ReplLine key={entry.id} entry={entry} agentId={agentId} />
        ))}

        {loading && (
          <div class="flex items-center gap-2 text-amber-600/80 py-0.5">
            <span class="loading loading-dots loading-xs" />
            <span class="text-[11px] text-gray-500">exécution…</span>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {suggestions.length > 0 && (
        <div
          class="bg-gray-50 border-t border-gray-100 px-4 py-2 flex flex-wrap gap-1.5 shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
          {suggestions.map((s) => (
            <button
              key={s.name}
              type="button"
              onClick={() => pickSuggestion(s.name)}
              class="text-[11px] font-mono px-2.5 py-1 rounded-full bg-white text-gray-700 hover:border-[#175B37]/35 border border-gray-200 transition-colors"
            >
              <span style={{ color: FORGE }}>/{s.name}</span>
              <span class="text-gray-400 ml-1">— {s.description}</span>
            </button>
          ))}
          <span class="text-[10px] text-gray-400 self-center ml-1">Tab ↵</span>
        </div>
      )}

      <div
        class="flex items-center gap-2 px-4 py-3 bg-gray-50/90 border-t border-gray-100 shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <span class="font-mono text-[12px] select-none shrink-0 text-gray-500">
          <span style={{ color: FORGE }}>forge</span>
          <span class="text-gray-400">:</span>
          <span style={{ color: FORGE_MUTED }}>{agentId}</span>
          <span class="text-gray-400">$</span>
        </span>

        <input
          ref={inputRef}
          type="text"
          value={input}
          onInput={(e) => handleInput((e.target as HTMLInputElement).value)}
          onKeyDown={handleKeyDown}
          placeholder="/help"
          disabled={loading}
          class="flex-1 bg-white border border-gray-200 rounded-full px-3 py-1.5 outline-none font-mono text-[12px] text-gray-900 placeholder-gray-400 disabled:opacity-40 focus:ring-2 focus:ring-[#175B37]/20 focus:border-[#175B37]/40"
          style={{ caretColor: FORGE }}
          autoComplete="off"
          autoCorrect="off"
          spellcheck={false}
        />

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            submit();
          }}
          disabled={loading || !input.trim()}
          class="shrink-0 p-2 rounded-full border border-transparent transition-colors disabled:opacity-25 hover:bg-white hover:border-gray-200 hover:shadow-sm"
          style={{ color: FORGE }}
          title="Exécuter (Entrée)"
        >
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
      <div class="text-gray-500 text-[11px] py-0.5 border-b border-gray-100 mb-2">
        {content}
      </div>
    );
  }

  if (type === 'info') {
    return (
      <div class="flex gap-2 items-start py-0.5">
        {ts && <span class="text-gray-400 text-[10px] mt-0.5 shrink-0 w-16">{ts}</span>}
        <span class="text-sky-600">{content}</span>
      </div>
    );
  }

  if (type === 'cmd') {
    return (
      <div class="flex gap-2 items-start py-1">
        {ts && <span class="text-gray-400 text-[10px] mt-0.5 shrink-0 w-16">{ts}</span>}
        <div class="flex items-start gap-1.5 flex-wrap">
          <span class="text-gray-500 shrink-0">
            <span style={{ color: FORGE }}>forge</span>
            <span class="text-gray-400">:</span>
            <span style={{ color: FORGE_MUTED }}>{agentId}</span>
            <span style={{ color: FORGE }}>$</span>
          </span>
          <span class="text-gray-900 break-all">{content}</span>
        </div>
      </div>
    );
  }

  if (type === 'error') {
    return (
      <div class="flex gap-2 items-start py-0.5">
        {ts && <span class="text-gray-400 text-[10px] mt-0.5 shrink-0 w-16">{ts}</span>}
        <pre class="text-red-600 whitespace-pre-wrap break-words">{content}</pre>
      </div>
    );
  }

  return (
    <div class="flex gap-2 items-start py-0.5">
      {ts && <span class="text-gray-400 text-[10px] mt-0.5 shrink-0 w-16">{ts}</span>}
      <pre class="text-gray-700 whitespace-pre-wrap break-words leading-relaxed text-[11.5px]">{content}</pre>
    </div>
  );
}
