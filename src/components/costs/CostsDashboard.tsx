/** @jsxImportSource preact */
import { useState, useEffect, useCallback } from 'preact/hooks';

interface AgentCost {
  agentId: string;
  model?: string;
  monthlyCents: number;
  spentThisMonth: number;
  alertThreshold: number;
  hardStop: 0 | 1;
  monthly: { cents: number; inputTokens: number; outputTokens: number };
  total: { cents: number; inputTokens: number; outputTokens: number; calls: number };
  pct: number | null;
}

interface GlobalMonthly {
  cents: number;
  inputTokens: number;
  outputTokens: number;
}

interface BudgetData {
  agents: AgentCost[];
  globalMonthly: GlobalMonthly;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtCents(cents: number): string {
  if (cents === 0) return '0¢';
  if (cents < 100) return `${cents}¢`;
  return `${(cents / 100).toFixed(2)} €`;
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function pctColor(pct: number | null): string {
  if (pct === null) return '#9CA3AF'; // gris = illimité
  if (pct >= 100) return '#EF4444';   // rouge
  if (pct >= 80) return '#F59E0B';    // orange
  return '#10B981';                   // vert
}

// ─── BudgetBar ────────────────────────────────────────────────────────────────

function BudgetBar({ pct, hardStop }: { pct: number | null; hardStop: 0 | 1 }) {
  const display = pct === null ? 0 : Math.min(pct, 100);
  const color = pctColor(pct);
  return (
    <div class="w-full h-2 rounded-full bg-gray-100 overflow-hidden" title={pct !== null ? `${pct}%` : 'Illimité'}>
      <div
        class="h-full rounded-full transition-all duration-500"
        style={{ width: `${display}%`, background: color, boxShadow: hardStop && pct !== null && pct >= 80 ? `0 0 6px ${color}80` : 'none' }}
      />
    </div>
  );
}

// ─── BudgetModal ──────────────────────────────────────────────────────────────

function BudgetModal({
  agent,
  onClose,
  onSaved,
}: {
  agent: AgentCost;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [monthlyCents, setMonthlyCents] = useState(agent.monthlyCents);
  const [alertThreshold, setAlertThreshold] = useState(agent.alertThreshold);
  const [hardStop, setHardStop] = useState(agent.hardStop === 1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function save() {
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/agent-budget', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId: agent.agentId,
          monthlyCents,
          alertThreshold,
          hardStop: hardStop ? 1 : 0,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      onSaved();
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setSaving(false);
    }
  }

  async function resetSpent() {
    setSaving(true);
    try {
      await fetch('/api/agent-budget', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: agent.agentId, resetSpent: true }),
      });
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div class="bg-white rounded-[2rem] shadow-2xl p-8 w-full max-w-md space-y-5">
        <div class="flex items-center justify-between">
          <h3 class="text-xl font-bold text-gray-900">Budget — <span class="font-mono text-[#175B37]">{agent.agentId}</span></h3>
          <button onClick={onClose} class="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>

        <div class="space-y-4">
          <div>
            <label class="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">Budget mensuel ( centimes )</label>
            <input
              type="number"
              min="0"
              value={monthlyCents}
              onInput={(e) => setMonthlyCents(parseInt((e.target as HTMLInputElement).value, 10) || 0)}
              class="w-full border border-gray-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#175B37]/30"
              placeholder="0 = illimité"
            />
            <p class="text-[10px] text-gray-400 mt-1">Équivaut à {fmtCents(monthlyCents)} / mois. 0 = pas de budget (illimité).</p>
          </div>

          <div>
            <label class="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">Seuil d'alerte (%)</label>
            <input
              type="range"
              min="50"
              max="95"
              step="5"
              value={alertThreshold}
              onInput={(e) => setAlertThreshold(parseInt((e.target as HTMLInputElement).value, 10))}
              class="w-full accent-[#175B37]"
            />
            <p class="text-xs text-gray-500 mt-1">Alerte à : <strong>{alertThreshold}%</strong> du budget</p>
          </div>

          <div class="flex items-center gap-3">
            <input
              type="checkbox"
              id="hardStopCheck"
              checked={hardStop}
              onChange={(e) => setHardStop((e.target as HTMLInputElement).checked)}
              class="w-4 h-4 accent-red-500"
            />
            <label for="hardStopCheck" class="text-sm text-gray-700">
              <span class="font-semibold text-red-600">Hard stop</span> — pauser automatiquement l'agent à 100% du budget
            </label>
          </div>
        </div>

        {error && <p class="text-xs text-red-500">{error}</p>}

        <div class="flex gap-3 pt-2">
          <button
            onClick={save}
            disabled={saving}
            class="flex-1 bg-[#175B37] text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-[#175B37]/90 transition disabled:opacity-50"
          >
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
          <button
            onClick={resetSpent}
            disabled={saving}
            class="px-4 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50 transition"
            title="Remettre les dépenses du mois à zéro"
          >
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────

export default function CostsDashboard() {
  const [data, setData] = useState<BudgetData | null>(null);
  const [loading, setLoading] = useState(true);
  const [editAgent, setEditAgent] = useState<AgentCost | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/agent-budget');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
      setError('');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const iv = setInterval(load, 30_000);
    return () => clearInterval(iv);
  }, [load]);

  if (loading) {
    return (
      <div class="flex items-center justify-center h-40 text-gray-400 text-sm">
        <span class="inline-block w-4 h-4 border-2 border-[#175B37] border-t-transparent rounded-full animate-spin mr-2" />
        Chargement des coûts…
      </div>
    );
  }

  if (error) {
    return (
      <div class="bg-red-50 border border-red-100 rounded-2xl p-6 text-sm text-red-600">
        ⚠ Erreur : {error}
      </div>
    );
  }

  const agents = data?.agents ?? [];
  const global = data?.globalMonthly ?? { cents: 0, inputTokens: 0, outputTokens: 0 };

  const overBudget = agents.filter((a) => a.pct !== null && a.pct >= 100).length;
  const nearBudget = agents.filter((a) => a.pct !== null && a.pct >= 80 && a.pct < 100).length;

  const totalBudgetCents = agents.reduce((s, a) => s + (a.monthlyCents ?? 0), 0);
  const globalPct = totalBudgetCents > 0
    ? Math.round((global.cents / totalBudgetCents) * 100)
    : null;

  return (
    <div class="space-y-6">
      {/* KPIs globaux */}
      <div class="grid grid-cols-2 md:grid-cols-4 gap-5">
        <div class="bg-white rounded-[1.5rem] shadow-sm p-5">
          <span class="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-2">Dépenses du mois</span>
          <span class="text-4xl font-bold text-gray-900">{fmtCents(global.cents)}</span>
          {globalPct !== null && (
            <span class={`text-xs block mt-2 font-medium`} style={{ color: pctColor(globalPct) }}>
              {globalPct}% du budget total
            </span>
          )}
        </div>
        <div class="bg-white rounded-[1.5rem] shadow-sm p-5">
          <span class="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-2">Tokens ce mois</span>
          <span class="text-4xl font-bold text-gray-900">{fmtTokens(global.inputTokens + global.outputTokens)}</span>
          <span class="text-xs text-gray-400 block mt-2">{fmtTokens(global.inputTokens)} in · {fmtTokens(global.outputTokens)} out</span>
        </div>
        <div class="bg-white rounded-[1.5rem] shadow-sm p-5">
          <span class="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-2">Agents actifs</span>
          <span class="text-4xl font-bold text-gray-900">{agents.length}</span>
          <span class="text-xs text-gray-400 block mt-2">avec activité ce mois</span>
        </div>
        <div class="bg-white rounded-[1.5rem] shadow-sm p-5">
          <span class="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-2">Alertes budget</span>
          <span class="text-4xl font-bold" style={{ color: overBudget > 0 ? '#EF4444' : nearBudget > 0 ? '#F59E0B' : '#9CA3AF' }}>
            {overBudget + nearBudget}
          </span>
          <span class="text-xs block mt-2" style={{ color: overBudget > 0 ? '#EF4444' : '#9CA3AF' }}>
            {overBudget > 0 ? `${overBudget} dépassé(s)` : nearBudget > 0 ? `${nearBudget} proche(s)` : 'tout est OK'}
          </span>
        </div>
      </div>

      {/* Tableau agents */}
      <div class="bg-white rounded-[2rem] shadow-sm border border-gray-100 overflow-hidden">
        <div class="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
          <div class="w-1 h-5 rounded-full bg-emerald-500" />
          <h2 class="text-sm font-bold text-gray-900">Coûts par agent</h2>
          <span class="text-xs text-gray-400 ml-auto font-mono">Auto-refresh 30s</span>
        </div>

        {agents.length === 0 ? (
          <div class="py-16 text-center text-gray-400 text-sm">
            <p>Aucune donnée de coût.</p>
            <p class="text-xs mt-2 text-gray-300">Les agents doivent appeler POST /api/cost-event pour remonter leurs dépenses.</p>
          </div>
        ) : (
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead>
                <tr class="border-b border-gray-100">
                  <th class="text-[10px] uppercase font-bold text-gray-400 px-6 py-3 text-left">Agent</th>
                  <th class="text-[10px] uppercase font-bold text-gray-400 px-6 py-3 text-left">Modèle</th>
                  <th class="text-[10px] uppercase font-bold text-gray-400 px-6 py-3 text-right">Dép. mois</th>
                  <th class="text-[10px] uppercase font-bold text-gray-400 px-6 py-3 text-right">Budget</th>
                  <th class="text-[10px] uppercase font-bold text-gray-400 px-6 py-3 text-left w-40">Utilisation</th>
                  <th class="text-[10px] uppercase font-bold text-gray-400 px-6 py-3 text-right">Tokens mois</th>
                  <th class="text-[10px] uppercase font-bold text-gray-400 px-6 py-3 text-right">Total calls</th>
                  <th class="text-[10px] uppercase font-bold text-gray-400 px-6 py-3 text-center">Stop</th>
                  <th class="text-[10px] uppercase font-bold text-gray-400 px-6 py-3" />
                </tr>
              </thead>
              <tbody>
                {agents.map((a) => (
                  <tr key={a.agentId} class="border-b border-gray-50 hover:bg-emerald-50/30 transition-colors">
                    <td class="px-6 py-3">
                      <span class="font-mono text-xs font-semibold text-gray-800">{a.agentId}</span>
                    </td>
                    <td class="px-6 py-3">
                      <span class="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded font-mono">{a.model ?? '—'}</span>
                    </td>
                    <td class="px-6 py-3 text-right font-mono text-xs" style={{ color: pctColor(a.pct) }}>
                      {fmtCents(a.monthly?.cents ?? 0)}
                    </td>
                    <td class="px-6 py-3 text-right text-xs text-gray-400 font-mono">
                      {a.monthlyCents > 0 ? fmtCents(a.monthlyCents) : '∞'}
                    </td>
                    <td class="px-6 py-3">
                      <div class="flex items-center gap-2">
                        <BudgetBar pct={a.pct} hardStop={a.hardStop} />
                        <span class="text-[10px] font-mono w-8 text-right" style={{ color: pctColor(a.pct) }}>
                          {a.pct !== null ? `${a.pct}%` : '—'}
                        </span>
                      </div>
                    </td>
                    <td class="px-6 py-3 text-right text-xs text-gray-500 font-mono">
                      {fmtTokens((a.monthly?.inputTokens ?? 0) + (a.monthly?.outputTokens ?? 0))}
                    </td>
                    <td class="px-6 py-3 text-right text-xs text-gray-400">
                      {a.total?.calls ?? 0}
                    </td>
                    <td class="px-6 py-3 text-center">
                      {a.hardStop ? (
                        <span class="text-[10px] bg-red-50 text-red-500 px-2 py-0.5 rounded font-semibold">ON</span>
                      ) : (
                        <span class="text-[10px] bg-gray-100 text-gray-400 px-2 py-0.5 rounded">—</span>
                      )}
                    </td>
                    <td class="px-6 py-3">
                      <button
                        onClick={() => setEditAgent(a)}
                        class="text-[10px] border border-gray-200 rounded-lg px-2 py-1 text-gray-500 hover:bg-gray-50 hover:text-[#175B37] hover:border-[#175B37]/30 transition font-medium"
                      >
                        Budget
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal édition budget */}
      {editAgent && (
        <BudgetModal agent={editAgent} onClose={() => setEditAgent(null)} onSaved={load} />
      )}
    </div>
  );
}
