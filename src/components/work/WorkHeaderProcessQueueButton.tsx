import { useState } from 'preact/hooks';

/** Aligné sur WorkSystemPanel — le démarrage de cycle peut être long (agents / directives). */
const TIMEOUT_START_MS = 180_000;

export default function WorkHeaderProcessQueueButton() {
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  async function runQueue() {
    setFeedback(null);
    setBusy(true);
    const ac = new AbortController();
    const timer = window.setTimeout(() => ac.abort(), TIMEOUT_START_MS);
    try {
      const res = await fetch('/api/work-system', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start' }),
        signal: ac.signal,
      });
      const data = (await res.json()) as Record<string, unknown>;
      if (!res.ok) {
        throw new Error(typeof data.error === 'string' ? data.error : `Erreur HTTP ${res.status}`);
      }
      const wc = data.workCycle as { ok?: boolean; budgetBlocked?: string; error?: string } | undefined;
      if (wc?.budgetBlocked) {
        setFeedback(String(wc.budgetBlocked));
      } else if (wc && wc.ok === false && wc.error) {
        setFeedback(String(wc.error));
      } else if (wc && wc.ok === false) {
        setFeedback('Le cycle n’a pas pu aller au bout. Consultez la supervision automatique ci-dessous.');
      } else {
        setFeedback('Cycle lancé : dispatch carnet / file vers les agents.');
      }
      window.setTimeout(() => setFeedback(null), 8000);
    } catch (e) {
      const aborted =
        (typeof DOMException !== 'undefined' && e instanceof DOMException && e.name === 'AbortError') ||
        (e instanceof Error && e.name === 'AbortError');
      if (aborted) {
        setFeedback(
          `Dépassement du délai (${Math.round(TIMEOUT_START_MS / 1000)} s). Le serveur peut encore traiter la file — vérifiez la section « Supervision automatique » ou le fil d’activité.`,
        );
      } else {
        setFeedback(e instanceof Error ? e.message : String(e));
      }
      window.setTimeout(() => setFeedback(null), 10_000);
    } finally {
      window.clearTimeout(timer);
      setBusy(false);
    }
  }

  return (
    <div class="inline-flex min-h-[44px] flex-col items-stretch justify-center gap-0.5 sm:items-end">
      <button
        type="button"
        disabled={busy}
        title="Même action que « Démarrer maintenant » : envoi des directives et traitement du carnet / de la file d’attente."
        class="inline-flex min-h-[44px] items-center justify-center rounded-full bg-[#175B37] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#134d2e] disabled:cursor-not-allowed disabled:opacity-60"
        onClick={() => void runQueue()}
      >
        {busy ? 'Traitement…' : 'Traiter la file d’attente'}
      </button>
      {feedback ? (
        <span class="max-w-[min(100vw-2rem,280px)] text-right text-[11px] leading-snug text-gray-600 sm:text-left">
          {feedback}
        </span>
      ) : null}
    </div>
  );
}
