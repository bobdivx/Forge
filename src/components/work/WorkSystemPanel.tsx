import { useEffect, useMemo, useState } from 'preact/hooks';

type WorkSystemStatus = {
  state: 'running' | 'stopped' | 'scheduled';
  schedulerActive: boolean;
  lastStartedAt: string | null;
  lastStoppedAt: string | null;
  inScheduledWindow: boolean;
  nextWindowAt: string | null;
};

/** Aligné sur WorkCycleResult (forge-work-scheduler) — affichage uniquement. */
type WorkCycleResult = {
  ok: boolean;
  budgetBlocked?: string;
  zimaosErrors?: string[];
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

function fmtDate(v: string | null): string {
  if (!v) return '—';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
}

function parseStatusPayload(data: Record<string, unknown>): WorkSystemStatus {
  return {
    state: (data.state as WorkSystemStatus['state']) || 'scheduled',
    schedulerActive: Boolean(data.schedulerActive),
    lastStartedAt: (data.lastStartedAt as string | null) ?? null,
    lastStoppedAt: (data.lastStoppedAt as string | null) ?? null,
    inScheduledWindow: Boolean(data.inScheduledWindow),
    nextWindowAt: (data.nextWindowAt as string | null) ?? null,
  };
}

const TIMEOUT_START_MS = 180_000;
const TIMEOUT_OTHER_MS = 90_000;

export default function WorkSystemPanel() {
  const [status, setStatus] = useState<WorkSystemStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<'start' | 'stop' | 'schedule' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [longWaitHint, setLongWaitHint] = useState(false);
  const [lastWorkCycle, setLastWorkCycle] = useState<WorkCycleResult | null>(null);

  const stateBadge = useMemo(() => {
    const s = status?.state || 'scheduled';
    if (s === 'running') return { cls: 'bg-emerald-50 text-emerald-700', label: 'En cours' };
    if (s === 'stopped') return { cls: 'bg-rose-50 text-rose-700', label: 'Arrêté' };
    return { cls: 'bg-amber-50 text-amber-700', label: 'Planifié' };
  }, [status?.state]);

  async function refresh() {
    setError(null);
    try {
      const res = await fetch('/api/work-system');
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Erreur API /api/work-system');
      setStatus(parseStatusPayload(data as Record<string, unknown>));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => {
      void refresh();
    }, 20_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (busyAction !== 'start') {
      setLongWaitHint(false);
      return;
    }
    const t = window.setTimeout(() => setLongWaitHint(true), 8000);
    return () => {
      window.clearTimeout(t);
      setLongWaitHint(false);
    };
  }, [busyAction]);

  async function runAction(action: 'start' | 'stop' | 'schedule') {
    setBusyAction(action);
    setError(null);
    if (action === 'start') {
      setLastWorkCycle(null);
    }
    const timeoutMs = action === 'start' ? TIMEOUT_START_MS : TIMEOUT_OTHER_MS;
    const ac = new AbortController();
    const timer = window.setTimeout(() => ac.abort(), timeoutMs);
    try {
      const res = await fetch('/api/work-system', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
        signal: ac.signal,
      });
      const data = (await res.json()) as Record<string, unknown>;
      if (!res.ok) {
        throw new Error(typeof data.error === 'string' ? data.error : `Erreur action ${action}`);
      }

      setStatus(parseStatusPayload(data));
      if (action === 'start' && data.workCycle != null) {
        setLastWorkCycle(data.workCycle as WorkCycleResult);
      }
      if (action !== 'start') {
        setLastWorkCycle(null);
      }
    } catch (e) {
      const aborted =
        (typeof DOMException !== 'undefined' && e instanceof DOMException && e.name === 'AbortError') ||
        (e instanceof Error && e.name === 'AbortError');
      if (aborted) {
        const sec = Math.round(timeoutMs / 1000);
        setError(
          `Délai dépassé (${sec} s). Le serveur peut encore envoyer les directives — vérifiez les journaux ou rechargez la page pour voir l’état réel.`,
        );
        void refresh();
      } else {
        setError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      window.clearTimeout(timer);
      setBusyAction(null);
    }
  }

  const wake = lastWorkCycle?.wakeReport;

  return (
    <section class="bg-white rounded-[1.5rem] shadow-sm border border-gray-100 p-5">
      <div class="flex flex-wrap items-center gap-2">
        <h3 class="text-base font-bold text-gray-900">Supervision automatique</h3>
        <span class={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${stateBadge.cls}`}>
          {stateBadge.label}
        </span>
      </div>
      <p class="mt-1 text-xs text-gray-500">
        Chef superviseur: <span class="font-semibold text-gray-700">CHEF_TECHNIQUE</span> (prioritaire), avec dispatch sur les agents actifs.
      </p>

      {loading && busyAction === null ? (
        <p class="mt-3 text-xs text-gray-400">Chargement de l’état du scheduler…</p>
      ) : !loading ? (
        <div class="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          <div class="rounded-xl bg-gray-50 p-3">
            <p class="text-gray-400">Scheduler actif</p>
            <p class="font-semibold text-gray-700">{status?.schedulerActive ? 'Oui' : 'Non'}</p>
          </div>
          <div class="rounded-xl bg-gray-50 p-3">
            <p class="text-gray-400">Dans la plage horaire</p>
            <p class="font-semibold text-gray-700">{status?.inScheduledWindow ? 'Oui' : 'Non'}</p>
          </div>
          <div class="rounded-xl bg-gray-50 p-3">
            <p class="text-gray-400">Dernier démarrage</p>
            <p class="font-semibold text-gray-700">{fmtDate(status?.lastStartedAt ?? null)}</p>
          </div>
          <div class="rounded-xl bg-gray-50 p-3">
            <p class="text-gray-400">Prochaine plage</p>
            <p class="font-semibold text-gray-700">{fmtDate(status?.nextWindowAt ?? null)}</p>
          </div>
        </div>
      ) : null}

      {error ? (
        <p class="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>
      ) : null}

      {busyAction === 'start' && (
        <div class="mt-3 rounded-lg border border-[#175B37]/20 bg-[#E9F3EB]/80 px-3 py-2 text-xs text-[#134d2e]">
          <p class="font-semibold">Démarrage du cycle en cours…</p>
          {!longWaitHint ? (
            <p class="mt-1 text-[11px] opacity-90">
              Envoi des directives à chaque agent activé (avec nouvelles tentatives si besoin). Peut dépasser une minute si la liste d’agents est longue.
            </p>
          ) : (
            <p class="mt-1 text-[11px] font-medium text-amber-900">
              Toujours en cours après plusieurs secondes — vérifiez les journaux Forge ou votre plateforme d’agents si besoin. Le navigateur débloquera le bouton après le délai max ou à la réponse du serveur.
            </p>
          )}
        </div>
      )}

      {lastWorkCycle && busyAction === null ? (
        <div
          class={`mt-3 rounded-xl border px-3 py-3 text-xs ${
            lastWorkCycle.ok && !lastWorkCycle.budgetBlocked
              ? 'border-emerald-200 bg-emerald-50/90 text-emerald-950'
              : 'border-amber-200 bg-amber-50/90 text-amber-950'
          }`}
        >
          <p class="font-bold text-[13px]">
            {lastWorkCycle.budgetBlocked
              ? 'Budget : cycle non démarré'
              : lastWorkCycle.ok
                ? 'Résultat du dernier démarrage'
                : 'Le cycle n’a pas pu aller au bout'}
          </p>
          {lastWorkCycle.budgetBlocked ? (
            <p class="mt-2">{lastWorkCycle.budgetBlocked}</p>
          ) : null}
          {lastWorkCycle.error ? <p class="mt-2 text-rose-800">{lastWorkCycle.error}</p> : null}
          {!lastWorkCycle.ok && !lastWorkCycle.budgetBlocked && !lastWorkCycle.error ? (
            <p class="mt-2 text-[11px]">
              Cause fréquente : un autre cycle est déjà en cours côté serveur, ou le démarrage a été refusé. Réessayez après quelques secondes.
            </p>
          ) : null}
          {wake && lastWorkCycle.ok ? (
            <ul class="mt-2 space-y-1.5 text-[11px]">
              <li>
                <span class="font-semibold">Agents ciblés :</span> {wake.targeted}
              </li>
              <li>
                <span class="font-semibold">Directive livrée à :</span>{' '}
                {wake.awakened?.length ? wake.awakened.join(', ') : '—'}
              </li>
              {wake.failed?.length ? (
                <li class="text-rose-800">
                  <span class="font-semibold">Échecs d’envoi :</span>{' '}
                  {wake.failed.map((f) => `${f.agentId} (${f.error})`).join(' · ')}
                </li>
              ) : (
                <li class="text-emerald-800">
                  <span class="font-semibold">Échecs d’envoi vers les agents :</span> aucun
                </li>
              )}
              {wake.sessionCheck ? (
                <li class="mt-1 border-t border-emerald-200/60 pt-2">
                  <span class="font-semibold">Sessions agents (aperçu après envoi) :</span>{' '}
                  {wake.sessionCheck.active?.length ? (
                    <span class="text-emerald-800">
                      actives {wake.sessionCheck.active.length} ({wake.sessionCheck.active.slice(0, 6).join(', ')}
                      {wake.sessionCheck.active.length > 6 ? '…' : ''})
                    </span>
                  ) : (
                    <span>aucune détectée comme « active »</span>
                  )}
                  {wake.sessionCheck.missing?.length ? (
                    <span class="block mt-0.5 text-amber-900">
                      Non vues / inactives : {wake.sessionCheck.missing.slice(0, 8).join(', ')}
                      {wake.sessionCheck.missing.length > 8 ? '…' : ''}
                    </span>
                  ) : null}
                </li>
              ) : null}
            </ul>
          ) : null}
          {lastWorkCycle.zimaosErrors?.length ? (
            <p class="mt-2 text-[11px] text-rose-800">
              <span class="font-semibold">Erreurs liaison / passerelle :</span> {lastWorkCycle.zimaosErrors.join(' · ')}
            </p>
          ) : null}
        </div>
      ) : null}

      <div class="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          class="rounded-full bg-[#175B37] px-4 py-2 text-xs font-semibold text-white disabled:opacity-60"
          disabled={loading || busyAction !== null}
          onClick={() => void runAction('start')}
        >
          {busyAction === 'start' ? 'Démarrage…' : 'Démarrer maintenant'}
        </button>
        <button
          type="button"
          class="rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-xs font-semibold text-rose-700 disabled:opacity-60"
          disabled={loading || busyAction !== null}
          onClick={() => void runAction('stop')}
        >
          {busyAction === 'stop' ? 'Arrêt…' : 'Arrêter'}
        </button>
        <button
          type="button"
          class="rounded-full border border-amber-200 bg-amber-50 px-4 py-2 text-xs font-semibold text-amber-700 disabled:opacity-60"
          disabled={loading || busyAction !== null}
          onClick={() => void runAction('schedule')}
        >
          {busyAction === 'schedule' ? 'Activation…' : 'Repasser en planifié'}
        </button>
      </div>
    </section>
  );
}
