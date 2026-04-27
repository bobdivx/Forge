import { useState, useEffect } from 'preact/hooks';

// ── Types ────────────────────────────────────────────────────────────────────

type Schedule = {
  id: number;
  label: string;
  days: number[];
  startTime: string;
  endTime: string;
  agentIds: string[];
  enabled: boolean;
};

type WorkStatus = {
  state: 'running' | 'stopped' | 'scheduled';
  schedulerActive: boolean;
  lastStartedAt: string | null;
  lastStoppedAt: string | null;
  inScheduledWindow: boolean;
  nextWindowAt: string | null;
};

const DAYS = [
  { label: 'Dim', value: 0 },
  { label: 'Lun', value: 1 },
  { label: 'Mar', value: 2 },
  { label: 'Mer', value: 3 },
  { label: 'Jeu', value: 4 },
  { label: 'Ven', value: 5 },
  { label: 'Sam', value: 6 },
];

const KNOWN_AGENTS = [
  'CHEF_TECHNIQUE', 'ARCHITECTE_LOGICIEL', 'DEV_BACKEND', 'DEV_FRONTEND',
  'EXPERT_GITHUB', 'ANALYSTE_CODE', 'TESTEUR_QA', 'INFRA_TECH',
  'SECURITE_CODE', 'INGENIEUR_HARDWARE', 'INGENIEUR_PROMPT',
  'MAINTENANCE_REPO', 'REDACTEUR_DOC', 'SCRIPTEUR_AUTOMATE', 'VEILLE_TECH',
];

// ── Utils ────────────────────────────────────────────────────────────────────

function parseSchedule(raw: Record<string, unknown>): Schedule {
  let days: number[] = [];
  let agentIds: string[] = [];
  try { days = JSON.parse(raw.days as string); } catch { days = [1, 2, 3, 4, 5]; }
  try { agentIds = JSON.parse(raw.agentIds as string); } catch { agentIds = []; }
  return {
    id: raw.id as number,
    label: String(raw.label || 'Horaires de travail'),
    days,
    startTime: String(raw.startTime || '09:00'),
    endTime: String(raw.endTime || '18:00'),
    agentIds,
    enabled: raw.enabled === 1 || raw.enabled === true,
  };
}

function stateLabel(state: WorkStatus['state'], inWindow: boolean): string {
  if (state === 'running') return 'En cours';
  if (state === 'stopped') return 'Arrêté (manuel)';
  return inWindow ? 'Actif (planifié)' : 'En attente (planifié)';
}

function stateBg(state: WorkStatus['state'], inWindow: boolean): string {
  if (state === 'running' || (state === 'scheduled' && inWindow)) return 'bg-emerald-100 text-emerald-700';
  if (state === 'stopped') return 'bg-red-100 text-red-700';
  return 'bg-gray-100 text-gray-500';
}

// ── Sous-composants ──────────────────────────────────────────────────────────

function DayToggle({ day, selected, onChange }: { day: typeof DAYS[0]; selected: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      onClick={onChange}
      class={`w-10 h-10 rounded-full text-xs font-semibold transition-all border ${
        selected
          ? 'text-white border-transparent'
          : 'bg-white text-gray-400 border-gray-200 hover:border-gray-400'
      }`}
      style={selected ? 'background:#175B37' : undefined}
    >
      {day.label}
    </button>
  );
}

function ScheduleCard({
  schedule,
  onSave,
  onDelete,
  saving,
}: {
  schedule: Schedule;
  onSave: (s: Schedule) => Promise<void>;
  onDelete: () => Promise<void>;
  saving: boolean;
}) {
  const [local, setLocal] = useState<Schedule>({ ...schedule });
  const [dirty, setDirty] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const update = (patch: Partial<Schedule>) => {
    setLocal((p) => ({ ...p, ...patch }));
    setDirty(true);
  };

  const toggleDay = (v: number) => {
    const next = local.days.includes(v)
      ? local.days.filter((d) => d !== v)
      : [...local.days, v].sort();
    update({ days: next });
  };

  const toggleAgent = (id: string) => {
    const next = local.agentIds.includes(id)
      ? local.agentIds.filter((a) => a !== id)
      : [...local.agentIds, id];
    update({ agentIds: next });
  };

  return (
    <div class={`border rounded-2xl overflow-hidden transition-all ${local.enabled ? 'border-gray-200' : 'border-gray-100 opacity-60'}`}>
      {/* Header */}
      <div class="flex items-center gap-3 px-5 py-4 bg-gray-50 border-b border-gray-100">
        <button
          type="button"
          onClick={() => update({ enabled: !local.enabled })}
          class={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors duration-200 ${local.enabled ? 'bg-emerald-500' : 'bg-gray-300'}`}
        >
          <span
            class={`inline-block h-4 w-4 translate-y-0.5 rounded-full bg-white shadow transition-transform duration-200 ${local.enabled ? 'translate-x-4' : 'translate-x-0.5'}`}
          />
        </button>
        <input
          class="flex-1 text-sm font-semibold bg-transparent text-gray-900 focus:outline-none"
          value={local.label}
          onInput={(e) => update({ label: (e.target as HTMLInputElement).value })}
          placeholder="Libellé…"
        />
        <button
          type="button"
          onClick={() => setConfirmDelete((v) => !v)}
          class="text-gray-400 hover:text-red-500 transition-colors text-xs"
          title="Supprimer"
        >
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {confirmDelete && (
        <div class="px-5 py-3 bg-red-50 border-b border-red-100 flex items-center gap-3">
          <span class="text-xs text-red-700 flex-1">Supprimer cette plage ?</span>
          <button
            type="button"
            onClick={onDelete}
            class="text-xs font-semibold text-red-700 hover:text-red-900"
          >
            Confirmer
          </button>
          <button
            type="button"
            onClick={() => setConfirmDelete(false)}
            class="text-xs text-gray-500"
          >
            Annuler
          </button>
        </div>
      )}

      <div class="p-5 space-y-5">
        {/* Jours */}
        <div>
          <p class="text-[10px] text-gray-400 uppercase tracking-widest mb-2">Jours actifs</p>
          <div class="flex gap-2 flex-wrap">
            {DAYS.map((d) => (
              <DayToggle
                key={d.value}
                day={d}
                selected={local.days.includes(d.value)}
                onChange={() => toggleDay(d.value)}
              />
            ))}
          </div>
        </div>

        {/* Horaires */}
        <div class="flex gap-4 items-end">
          <div class="flex-1">
            <label class="text-[10px] text-gray-400 uppercase tracking-widest block mb-1">Début</label>
            <input
              type="time"
              class="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              value={local.startTime}
              onInput={(e) => update({ startTime: (e.target as HTMLInputElement).value })}
            />
          </div>
          <div class="text-gray-300 pb-2">→</div>
          <div class="flex-1">
            <label class="text-[10px] text-gray-400 uppercase tracking-widest block mb-1">Fin</label>
            <input
              type="time"
              class="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              value={local.endTime}
              onInput={(e) => update({ endTime: (e.target as HTMLInputElement).value })}
            />
          </div>
        </div>

        {/* Agents */}
        <div>
          <p class="text-[10px] text-gray-400 uppercase tracking-widest mb-2">
            Agents concernés{' '}
            <span class="normal-case text-gray-300">(vide = tous)</span>
          </p>
          <div class="flex flex-wrap gap-1.5">
            {KNOWN_AGENTS.map((id) => {
              const active = local.agentIds.includes(id);
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => toggleAgent(id)}
                  class={`px-2.5 py-1 rounded-full text-[10px] font-semibold transition-all border ${
                    active
                      ? 'text-white border-transparent'
                      : 'bg-white text-gray-400 border-gray-200 hover:border-gray-400'
                  }`}
                  style={active ? 'background:#175B37' : undefined}
                >
                  {id}
                </button>
              );
            })}
          </div>
        </div>

        {/* Save */}
        {dirty && (
          <div class="flex justify-end pt-1">
            <button
              type="button"
              onClick={async () => {
                await onSave(local);
                setDirty(false);
              }}
              disabled={saving}
              class="px-4 py-2 rounded-full text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              style="background:#175B37"
            >
              {saving ? 'Sauvegarde…' : 'Enregistrer'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Composant principal ───────────────────────────────────────────────────────

export default function WorkScheduleTab() {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [status, setStatus] = useState<WorkStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [controlling, setControlling] = useState(false);
  const [msg, setMsg] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const [schRes, sysRes] = await Promise.all([
        fetch('/api/work-schedules'),
        fetch('/api/work-system'),
      ]);
      const schData = await schRes.json().catch(() => ({ schedules: [] }));
      const sysData = await sysRes.json().catch(() => null);

      setSchedules((schData.schedules || []).map(parseSchedule));
      if (sysData) setStatus(sysData);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const interval = setInterval(async () => {
      const r = await fetch('/api/work-system').catch(() => null);
      if (r?.ok) {
        const d = await r.json().catch(() => null);
        if (d) setStatus(d);
      }
    }, 15_000);
    return () => clearInterval(interval);
  }, []);

  const saveSchedule = async (s: Schedule) => {
    setSaving(true);
    setMsg('');
    try {
      const res = await fetch('/api/work-schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: s.id,
          label: s.label,
          days: s.days,
          startTime: s.startTime,
          endTime: s.endTime,
          agentIds: s.agentIds,
          enabled: s.enabled,
        }),
      });
      if (res.ok) {
        setMsg('Plage sauvegardée.');
        await load();
      } else {
        const d = await res.json().catch(() => ({}));
        setMsg(d.error || 'Erreur lors de la sauvegarde.');
      }
    } catch {
      setMsg('Erreur réseau.');
    } finally {
      setSaving(false);
    }
  };

  const deleteSchedule = async (id: number) => {
    setSaving(true);
    try {
      await fetch('/api/work-schedules', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      setMsg('Plage supprimée.');
      await load();
    } catch {
      setMsg('Erreur réseau.');
    } finally {
      setSaving(false);
    }
  };

  const addSchedule = async () => {
    setSaving(true);
    try {
      await fetch('/api/work-schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: 'Nouvelle plage', days: [1, 2, 3, 4, 5], startTime: '09:00', endTime: '18:00', agentIds: [], enabled: true }),
      });
      await load();
    } finally {
      setSaving(false);
    }
  };

  const control = async (action: 'start' | 'stop' | 'schedule') => {
    setControlling(true);
    setMsg('');
    try {
      const res = await fetch('/api/work-system', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        setStatus(d);
        const wc = d.workCycle as
          | {
              ok?: boolean;
              budgetBlocked?: string;
              zimaosErrors?: string[];
              wakeReport?: {
                targeted: number;
                awakened: string[];
                failed: { agentId: string; error: string }[];
                sessionCheck?: { active: string[]; missing: string[] };
              };
              error?: string;
            }
          | undefined;
        if (action === 'start') {
          if (wc?.budgetBlocked) {
            setMsg(`Erreur : le cycle n'a pas démarré — ${wc.budgetBlocked}`);
          } else if (wc && wc.ok === false && wc.error) {
            setMsg(`Erreur : ${wc.error}`);
          } else if (wc?.wakeReport?.sessionCheck) {
            const ok = wc.wakeReport.sessionCheck.active;
            const ko = wc.wakeReport.sessionCheck.missing;
            setMsg(
              ko.length > 0
                ? `Travail démarré : sessions actives ${ok.length}/${wc.wakeReport.targeted}, manquantes: ${ko.join(', ')}.`
                : `Travail démarré : sessions actives ${ok.length}/${wc.wakeReport.targeted}.`,
            );
          } else if (wc?.zimaosErrors?.length) {
            setMsg(
              `Attention : ZimaOS n'a pas reçu les directives (${wc.zimaosErrors.join(' · ')}). Vérifiez le token, l'URL de la gateway et que sessions_send est autorisé.`,
            );
          } else {
            setMsg('Travail démarré : directives envoyées vers ZimaOS.');
          }
        } else {
          setMsg(action === 'stop' ? 'Système arrêté.' : 'Mode planifié activé.');
        }
      } else {
        setMsg(d.error || 'Erreur.');
      }
    } catch {
      setMsg('Erreur réseau.');
    } finally {
      setControlling(false);
    }
  };

  if (loading) return <div class="animate-pulse text-gray-400 p-6">Chargement…</div>;

  const st = status;

  return (
    <div class="p-6 space-y-6">
      {/* Statut système */}
      <div class="bg-gray-50 border border-gray-200 rounded-2xl p-5">
        <div class="flex items-start gap-4 flex-wrap">
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 mb-1">
              <span class="text-[10px] font-bold uppercase tracking-widest text-gray-400">
                Système de travail
              </span>
              {st && (
                <span class={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${stateBg(st.state, st.inScheduledWindow)}`}>
                  {stateLabel(st.state, st.inScheduledWindow)}
                </span>
              )}
            </div>
            <p class="text-xs text-gray-500">
              {st
                ? st.state === 'scheduled'
                  ? st.inScheduledWindow
                    ? 'Les agents travaillent selon les plages planifiées.'
                    : st.nextWindowAt
                    ? `Prochaine activation : ${new Date(st.nextWindowAt).toLocaleString('fr-FR', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}`
                    : 'Aucune plage active planifiée.'
                  : st.state === 'running'
                  ? `Démarré manuellement${st.lastStartedAt ? ' · ' + new Date(st.lastStartedAt).toLocaleString('fr-FR') : ''}`
                  : `Arrêté manuellement${st.lastStoppedAt ? ' · ' + new Date(st.lastStoppedAt).toLocaleString('fr-FR') : ''}`
                : 'Lecture du statut…'}
            </p>
          </div>

          {/* Boutons de contrôle */}
          <div class="flex gap-2 flex-wrap shrink-0">
            {st?.state !== 'running' && (
              <button
                type="button"
                onClick={() => control('start')}
                disabled={controlling}
                class="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                style="background:#175B37"
              >
                <svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M6.3 2.84A1.5 1.5 0 004 4.11v11.78a1.5 1.5 0 002.3 1.27l9.34-5.89a1.5 1.5 0 000-2.54L6.3 2.84z" />
                </svg>
                Démarrer
              </button>
            )}
            {st?.state === 'running' && (
              <button
                type="button"
                onClick={() => control('stop')}
                disabled={controlling}
                class="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold text-white bg-red-500 transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                <svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                  <rect x="4" y="4" width="4" height="12" rx="1" />
                  <rect x="12" y="4" width="4" height="12" rx="1" />
                </svg>
                Arrêter
              </button>
            )}
            {st?.state === 'stopped' && (
              <button
                type="button"
                onClick={() => control('schedule')}
                disabled={controlling}
                class="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                Réactiver planification
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Plages horaires */}
      <div>
        <div class="flex items-center justify-between mb-3">
          <div>
            <h4 class="text-sm font-semibold text-gray-900">Plages de travail</h4>
            <p class="text-[10px] text-gray-400 mt-0.5">
              Le système démarre automatiquement les agents en début de plage et s'arrête à la fin.
            </p>
          </div>
          <button
            type="button"
            onClick={addSchedule}
            disabled={saving}
            class="flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-semibold border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Ajouter une plage
          </button>
        </div>

        {schedules.length === 0 ? (
          <div class="text-center py-10 border-2 border-dashed border-gray-200 rounded-2xl">
            <p class="text-sm text-gray-400">Aucune plage configurée.</p>
            <p class="text-xs text-gray-300 mt-1">
              Cliquez sur "Ajouter une plage" pour créer les horaires de travail des agents.
            </p>
          </div>
        ) : (
          <div class="space-y-4">
            {schedules.map((s) => (
              <ScheduleCard
                key={s.id}
                schedule={s}
                onSave={saveSchedule}
                onDelete={() => deleteSchedule(s.id)}
                saving={saving}
              />
            ))}
          </div>
        )}
      </div>

      {msg && (
        <p class={`text-sm font-medium ${msg.toLowerCase().includes('erreur') ? 'text-red-500' : 'text-emerald-600'}`}>
          {msg}
        </p>
      )}
    </div>
  );
}
