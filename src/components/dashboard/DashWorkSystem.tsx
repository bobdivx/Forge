import { useState, useEffect } from 'preact/hooks';

type WorkStatus = {
  state: 'running' | 'stopped' | 'scheduled';
  schedulerActive: boolean;
  lastStartedAt: string | null;
  lastStoppedAt: string | null;
  inScheduledWindow: boolean;
  nextWindowAt: string | null;
};

type WorkCyclePayload = {
  ok?: boolean;
  budgetBlocked?: string;
  forgeErrors?: string[];
  wakeReport?: {
    targeted: number;
    awakened: string[];
    failed: { agentId: string; error: string }[];
    sessionCheck?: {
      active: string[];
      missing: string[];
    };
  };
  error?: string;
};

function stateLabel(state: WorkStatus['state'], inWindow: boolean): string {
  if (state === 'running') return 'En cours';
  if (state === 'stopped') return 'Arrêté';
  return inWindow ? 'Planifié (actif)' : 'Planifié (veille)';
}

function stateClass(state: WorkStatus['state'], inWindow: boolean): string {
  if (state === 'running' || (state === 'scheduled' && inWindow)) {
    return 'bg-emerald-100 text-emerald-800';
  }
  if (state === 'stopped') return 'bg-red-100 text-red-700';
  return 'bg-gray-100 text-gray-600';
}

export default function DashWorkSystem() {
  const [status, setStatus] = useState<WorkStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const load = async () => {
    const r = await fetch('/api/work-system').catch(() => null);
    if (r?.ok) {
      const d = await r.json().catch(() => null);
      if (d) setStatus(d as WorkStatus);
    }
  };

  useEffect(() => {
    load();
    const i = setInterval(load, 15_000);
    return () => clearInterval(i);
  }, []);

  const control = async (action: 'start' | 'stop' | 'schedule') => {
    setBusy(true);
    setMsg('');
    try {
      const res = await fetch('/api/work-system', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        setStatus(d as WorkStatus);
        const wc = d.workCycle as WorkCyclePayload | undefined;
        if (action === 'start') {
          if (wc?.budgetBlocked) {
            setMsg(`Budget : ${wc.budgetBlocked}`);
          } else if (wc && wc.ok === false && wc.error) {
            setMsg(wc.error);
          } else if (wc?.wakeReport?.sessionCheck) {
            const ok = wc.wakeReport.sessionCheck.active;
            const ko = wc.wakeReport.sessionCheck.missing;
            if (ko.length > 0) {
              setMsg(
                `Sessions actives: ${ok.length}/${wc.wakeReport.targeted} — manquantes: ${ko.join(', ')}`,
              );
            } else {
              setMsg(`Agents Forge actifs: ${ok.length}/${wc.wakeReport.targeted}`);
            }
          } else if (wc?.forgeErrors?.length) {
            setMsg(`Forge : ${wc.forgeErrors.join(' · ')}`);
          } else {
            setMsg('Directives envoyées.');
          }
        } else {
          setMsg(action === 'stop' ? 'Arrêté.' : 'Mode planifié.');
        }
        setTimeout(() => setMsg(''), 8000);
      } else {
        setMsg(typeof d.error === 'string' ? d.error : 'Erreur');
      }
    } catch {
      setMsg('Erreur réseau');
    } finally {
      setBusy(false);
    }
  };

  const st = status;

  return (
    <div class="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3 sm:px-5 sm:py-4 flex flex-col sm:flex-row sm:flex-wrap sm:items-center sm:justify-between gap-3">
      <div class="flex flex-wrap items-center gap-2 sm:gap-3 min-w-0">
        <span class="text-xs font-bold uppercase tracking-widest text-gray-400 shrink-0">Travail swarm</span>
        {st ? (
          <span
            class={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-semibold shrink-0 ${stateClass(st.state, st.inScheduledWindow)}`}
          >
            {stateLabel(st.state, st.inScheduledWindow)}
          </span>
        ) : (
          <span class="text-[10px] text-gray-400 animate-pulse">Chargement…</span>
        )}
        {st?.state === 'scheduled' && !st.inScheduledWindow && st.nextWindowAt && (
          <span class="text-[10px] text-gray-500 truncate max-w-[14rem] sm:max-w-xs" title={st.nextWindowAt}>
            Prochain :{' '}
            {new Date(st.nextWindowAt).toLocaleString('fr-FR', {
              weekday: 'short',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
        )}
      </div>

      <div class="flex flex-wrap items-center gap-2 shrink-0">
        {st?.state !== 'running' && (
          <button
            type="button"
            onClick={() => control('start')}
            disabled={busy}
            class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            style="background:#175B37"
          >
            <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20" aria-hidden>
              <path d="M6.3 2.84A1.5 1.5 0 004 4.11v11.78a1.5 1.5 0 002.3 1.27l9.34-5.89a1.5 1.5 0 000-2.54L6.3 2.84z" />
            </svg>
            Démarrer
          </button>
        )}
        {st?.state === 'running' && (
          <button
            type="button"
            onClick={() => control('stop')}
            disabled={busy}
            class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold text-white bg-red-500 transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            Arrêter
          </button>
        )}
        {st?.state === 'stopped' && (
          <button
            type="button"
            onClick={() => control('schedule')}
            disabled={busy}
            class="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium border border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100 disabled:opacity-50"
          >
            Planifié
          </button>
        )}
        <a
          href="/settings#schedule"
          class="text-xs font-medium text-emerald-800 hover:underline px-1"
        >
          Horaires →
        </a>
      </div>

      {msg && (
        <p
          class={`text-xs sm:w-full ${msg.toLowerCase().includes('forge :') || msg.toLowerCase().includes('budget') || msg.toLowerCase().includes('erreur') ? 'text-amber-700' : 'text-emerald-700'}`}
        >
          {msg}
        </p>
      )}
    </div>
  );
}
