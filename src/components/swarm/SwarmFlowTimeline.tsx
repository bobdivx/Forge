import { useCallback, useEffect, useState } from 'preact/hooks';

type SwarmTimelineTone = 'neutral' | 'success' | 'warning' | 'brand' | 'info';

type SwarmTimelineEventRow = {
  id: string;
  at: string;
  kind: 'system' | 'message' | 'task';
  icon: string;
  title: string;
  body?: string;
  actor?: string;
  target?: string;
  tone: SwarmTimelineTone;
};

function toneClasses(t: SwarmTimelineTone): string {
  switch (t) {
    case 'success':
      return 'border-emerald-200 bg-emerald-50/80';
    case 'warning':
      return 'border-amber-200 bg-amber-50/80';
    case 'brand':
      return 'border-[#175B37]/30 bg-[#E9F3EB]';
    case 'info':
      return 'border-blue-200 bg-blue-50/70';
    default:
      return 'border-gray-200 bg-white';
  }
}

function formatFr(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString('fr-FR', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function kindLabel(k: SwarmTimelineEventRow['kind']): string {
  if (k === 'system') return 'Système Forge';
  if (k === 'message') return 'Échange';
  return 'Mission';
}

export default function SwarmFlowTimeline() {
  const [events, setEvents] = useState<SwarmTimelineEventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    setErr('');
    try {
      const r = await fetch('/api/swarm-timeline');
      const d = await r.json();
      if (!r.ok || !d.ok) throw new Error(d.error || 'Chargement impossible');
      setEvents(Array.isArray(d.events) ? d.events : []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 12_000);
    return () => clearInterval(t);
  }, [load]);

  if (loading) {
    return (
      <div class="rounded-[1.5rem] border border-gray-100 bg-white p-10 text-center text-sm text-gray-400 animate-pulse">
        Chargement du flux…
      </div>
    );
  }

  if (err) {
    return (
      <div class="rounded-[1.5rem] border border-red-100 bg-red-50 px-6 py-4 text-sm text-red-600">
        {err}
      </div>
    );
  }

  if (!events.length) {
    return (
      <div class="rounded-[1.5rem] border border-dashed border-gray-200 bg-white p-10 text-center text-sm text-gray-500">
        Aucun événement récent. Démarrez une session de travail (Paramètres → Horaires) ou créez une entrée dans le{' '}
        <a href="/work" class="font-medium underline decoration-[#175B37]/40 hover:text-[#175B37]">
          carnet de bord
        </a>
        .
      </div>
    );
  }

  return (
    <div class="relative pl-2">
      <div class="absolute left-[19px] top-3 bottom-3 w-px bg-gray-200" aria-hidden="true" />
      <ul class="space-y-5">
        {events.map((ev) => (
          <li key={ev.id} class="relative flex gap-4 pl-1">
            <div
              class="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white bg-white text-lg shadow-sm"
              style={{ marginLeft: '2px' }}
              aria-hidden="true"
            >
              {ev.icon}
            </div>
            <article
              class={`flex-1 rounded-2xl border px-4 py-3 shadow-sm ${toneClasses(ev.tone)}`}
            >
              <div class="flex flex-wrap items-center gap-2 gap-y-1">
                <span class="text-[10px] font-bold uppercase tracking-widest text-gray-400">
                  {kindLabel(ev.kind)}
                </span>
                <span class="text-[10px] text-gray-400 font-mono">{formatFr(ev.at)}</span>
              </div>
              <h4 class="mt-1 text-sm font-semibold text-gray-900 leading-snug">{ev.title}</h4>
              {(ev.actor || ev.target) && (
                <p class="mt-1 text-[11px] text-gray-500">
                  {ev.actor && (
                    <span>
                      <span class="text-gray-400">De</span>{' '}
                      <span class="font-mono font-medium text-[#175B37]">{ev.actor}</span>
                    </span>
                  )}
                  {ev.actor && ev.target && <span class="text-gray-300"> · </span>}
                  {ev.target && (
                    <span>
                      <span class="text-gray-400">Vers</span>{' '}
                      <span class="font-mono font-medium text-gray-700">{ev.target}</span>
                    </span>
                  )}
                </p>
              )}
              {ev.body && (
                <p class="mt-2 text-xs text-gray-600 leading-relaxed whitespace-pre-wrap break-words">
                  {ev.body}
                </p>
              )}
            </article>
          </li>
        ))}
      </ul>
    </div>
  );
}
