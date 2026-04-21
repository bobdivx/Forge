import { useState, useEffect, useRef } from 'preact/hooks';

type ProjectOption = { id: number; name: string };
type ModalType = 'request' | 'issue' | 'dep' | null;

export interface WorkItem {
  _type: 'request' | 'issue' | 'dep';
  id: number;
  title: string;
  status: string;
  createdAt?: string;
  // request fields
  content?: string;
  priority?: string;
  author?: string;
  requestType?: string;
  projectId?: number;
  // issue fields
  url?: string;
  errorType?: string;
  detail?: string;
  reportedByAgentId?: string;
  assigneeAgentId?: string;
  // dep fields
  packageName?: string;
  versionSpec?: string;
  isDev?: number;
  reason?: string;
  requestedByAgentId?: string;
}

interface WorkModalsProps {
  projects: ProjectOption[];
}

const INPUT_CLS = 'w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-[#175B37] focus:ring-1 focus:ring-[#175B37]/20';
const LABEL_CLS = 'block text-xs font-medium text-gray-500 mb-1';
const SELECT_CLS = `${INPUT_CLS} cursor-pointer`;

const KNOWN_AGENTS = [
  { id: 'CHEF_TECHNIQUE',      label: 'Chef technique (défaut)' },
  { id: 'DEV_FRONTEND',        label: 'Dev Frontend' },
  { id: 'DEV_BACKEND',         label: 'Dev Backend' },
  { id: 'TESTEUR_QA',          label: 'Testeur QA' },
  { id: 'ANALYSTE_CODE',       label: 'Analyste code' },
  { id: 'ARCHITECTE_LOGICIEL', label: 'Architecte logiciel' },
  { id: 'INFRA_TECH',          label: 'Infra / DevOps' },
  { id: 'SECURITE_CODE',       label: 'Sécurité code' },
  { id: 'INGENIEUR_PROMPT',    label: 'Ingénieur prompt' },
  { id: 'REDACTEUR_DOC',       label: 'Rédacteur doc' },
  { id: 'VEILLE_TECH',         label: 'Veille tech' },
  { id: 'SCRIPTEUR_AUTOMATE',  label: 'Scripteur automate' },
  { id: 'MAINTENANCE_REPO',    label: 'Maintenance repo' },
  { id: 'INGENIEUR_HARDWARE',  label: 'Ingénieur hardware' },
  { id: 'EXPERT_GITHUB',       label: 'Expert GitHub' },
];

const REQUEST_STATUSES  = ['pending', 'in_progress', 'completed', 'rejected'];
const ISSUE_STATUSES    = ['open', 'in_progress', 'resolved', 'wont_fix'];
const DEP_STATUSES      = ['open', 'in_progress', 'installed', 'rejected'];

const STATUS_COLORS: Record<string, string> = {
  pending:     'bg-orange-50 text-orange-600',
  open:        'bg-orange-50 text-orange-600',
  in_progress: 'bg-yellow-50 text-yellow-600',
  completed:   'bg-green-50 text-green-600',
  resolved:    'bg-green-50 text-green-600',
  installed:   'bg-green-50 text-green-600',
  rejected:    'bg-red-50 text-red-500',
  wont_fix:    'bg-red-50 text-red-500',
};

function agentLabel(id: string) {
  return KNOWN_AGENTS.find(a => a.id === id)?.label ?? id;
}

function AgentSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <select class={SELECT_CLS} value={value} onInput={(e) => onChange((e.target as HTMLSelectElement).value)}>
      {KNOWN_AGENTS.map(a => <option value={a.id}>{a.label}</option>)}
    </select>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MODAL DÉTAIL
// ═══════════════════════════════════════════════════════════════════════════
function DetailModal({ item, projects, onClose, onDeleted, onUpdated }: {
  item: WorkItem;
  projects: ProjectOption[];
  onClose: () => void;
  onDeleted: () => void;
  onUpdated: (patch: Partial<WorkItem>) => void;
}) {
  const statuses = item._type === 'request' ? REQUEST_STATUSES
                 : item._type === 'issue'   ? ISSUE_STATUSES
                 : DEP_STATUSES;

  const apiPath = item._type === 'request' ? '/api/agent-proposals'
                : item._type === 'issue'   ? '/api/agent-issues'
                : '/api/agent-dependencies';

  const currentAssignee = item.assigneeAgentId ?? (item._type === 'dep' ? 'DEV_BACKEND' : 'CHEF_TECHNIQUE');

  const [status, setStatus]   = useState(item.status);
  const [assignee, setAssignee] = useState(currentAssignee);
  const [saving, setSaving]   = useState(false);
  const [relaunching, setRelaunching] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError]     = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const projectName = projects.find(p => p.id === item.projectId)?.name ?? '—';

  async function saveChanges() {
    setError(''); setSaving(true);
    try {
      const body: Record<string, unknown> = { id: item.id, status, assigneeAgentId: assignee };
      const res = await fetch(apiPath, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur');
      onUpdated({ status, assigneeAgentId: assignee });
      setSuccessMsg('Sauvegardé !');
      setTimeout(() => setSuccessMsg(''), 2000);
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  }

  async function relaunch() {
    setError(''); setRelaunching(true);
    try {
      // Envoie un AgentMessage de relance
      const label = item._type === 'request' ? `demande #${item.id} "${item.title?.slice(0, 120)}"`
                  : item._type === 'issue'   ? `bug #${item.id} "${item.title?.slice(0, 120)}"`
                  : `dépendance #${item.id} "${item.packageName}"`;
      const res = await fetch('/api/forge-hook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId: 'HUMAIN',
          type: 'message',
          to: assignee,
          title: `Relance — ${label}`,
          content: `Merci de traiter cette entrée : ${label}. Statut actuel : ${status}.`,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur');
      setSuccessMsg(`Relance envoyée à ${agentLabel(assignee)} !`);
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (e: any) { setError(e.message); }
    finally { setRelaunching(false); }
  }

  async function deleteItem() {
    setError(''); setDeleting(true);
    try {
      const res = await fetch(apiPath, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: item.id }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur');
      onDeleted();
    } catch (e: any) { setError(e.message); setDeleting(false); }
  }

  const accentColor = item._type === 'request' ? '#F59E0B'
                    : item._type === 'issue'   ? '#EF4444'
                    : '#3B82F6';
  const typeLabel   = item._type === 'request' ? 'Demande'
                    : item._type === 'issue'   ? 'Bug / Anomalie'
                    : 'Dépendance npm';

  return (
    <div class="space-y-5">
      {/* Titre + badge type */}
      <div>
        <div class="flex items-center gap-2 mb-2">
          <span class="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded" style={`background:${accentColor}20;color:${accentColor}`}>{typeLabel}</span>
          <span class="text-[10px] text-gray-400">#{item.id}</span>
          {item.createdAt && (
            <span class="text-[10px] text-gray-400 ml-auto">
              {new Date(item.createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}
            </span>
          )}
        </div>
        <h3 class="text-sm font-bold text-gray-900 leading-snug">
          {item._type === 'dep' ? item.packageName + (item.versionSpec ? `@${item.versionSpec}` : '') : item.title}
        </h3>
        {item._type !== 'dep' && item.title && (
          <p class="text-xs text-gray-500 mt-1 line-clamp-3">{item.content || item.detail || item.reason || ''}</p>
        )}
      </div>

      {/* Infos spécifiques */}
      <div class="bg-gray-50 rounded-xl p-4 space-y-2 text-xs">
        {item._type === 'request' && (
          <>
            <div class="flex justify-between"><span class="text-gray-400">Projet</span><span class="text-gray-700 font-medium">{projectName}</span></div>
            <div class="flex justify-between"><span class="text-gray-400">Type</span><span class="text-purple-600 font-medium">{item.requestType || '—'}</span></div>
            <div class="flex justify-between"><span class="text-gray-400">Priorité</span><span class="font-medium">{item.priority || '—'}</span></div>
            <div class="flex justify-between"><span class="text-gray-400">Auteur</span><span class="text-gray-700">{item.author || '—'}</span></div>
            <div class="flex justify-between pt-1 border-t border-gray-200"><span class="text-gray-400">Agent cible</span><span class="font-medium" style={`color:${accentColor}`}>{agentLabel(assignee)}</span></div>
          </>
        )}
        {item._type === 'issue' && (
          <>
            <div class="flex justify-between gap-4"><span class="text-gray-400 flex-shrink-0">URL</span><span class="text-blue-600 font-mono text-right truncate">{item.url}</span></div>
            <div class="flex justify-between"><span class="text-gray-400">Type</span><span class="font-mono text-gray-700">{item.errorType}</span></div>
            <div class="flex justify-between"><span class="text-gray-400">Rapporté par</span><span style="color:#175B37" class="font-medium">{item.reportedByAgentId}</span></div>
            {item.detail && <div class="pt-1 border-t border-gray-200"><p class="text-gray-500 line-clamp-3">{item.detail}</p></div>}
          </>
        )}
        {item._type === 'dep' && (
          <>
            <div class="flex justify-between"><span class="text-gray-400">Type</span><span class="font-medium">{item.isDev ? 'devDependency' : 'dependency'}</span></div>
            <div class="flex justify-between"><span class="text-gray-400">Demandé par</span><span style="color:#175B37" class="font-medium">{item.requestedByAgentId}</span></div>
            {item.reason && <div class="pt-1 border-t border-gray-200"><p class="text-gray-500">{item.reason}</p></div>}
          </>
        )}
        {item.assigneeAgentId && (
          <div class="flex justify-between pt-1 border-t border-gray-200">
            <span class="text-gray-400">Assigné à</span>
            <span class="font-medium" style={`color:${accentColor}`}>{agentLabel(item.assigneeAgentId)}</span>
          </div>
        )}
      </div>

      {/* Changer le statut */}
      <div>
        <label class={LABEL_CLS}>Statut</label>
        <div class="flex flex-wrap gap-2">
          {statuses.map(s => (
            <button
              type="button"
              onClick={() => setStatus(s)}
              class={`text-[11px] font-semibold px-3 py-1.5 rounded-full border transition-all ${
                status === s
                  ? `${STATUS_COLORS[s]} border-current`
                  : 'border-gray-200 text-gray-400 hover:border-gray-300'
              }`}
            >{s}</button>
          ))}
        </div>
      </div>

      {/* Réassigner */}
      <div>
        <label class={LABEL_CLS}>
          {item._type === 'request' ? 'Notifier / réassigner' : 'Agent assigné'}
        </label>
        <AgentSelect value={assignee} onChange={setAssignee} />
      </div>

      {error && <p class="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
      {successMsg && <p class="text-xs text-green-600 bg-green-50 px-3 py-2 rounded-lg">{successMsg}</p>}

      {/* Actions */}
      <div class="space-y-2 pt-1">
        {/* Sauvegarder */}
        <div class="flex gap-2">
          <button type="button" onClick={onClose} class="flex-1 rounded-full border border-gray-200 text-gray-500 text-sm font-medium py-2 hover:bg-gray-50 transition-colors">
            Fermer
          </button>
          <button type="button" onClick={saveChanges} disabled={saving} class="flex-1 rounded-full text-white text-sm font-medium py-2 transition-colors disabled:opacity-50" style="background:#175B37">
            {saving ? 'Sauvegarde…' : 'Sauvegarder'}
          </button>
        </div>

        {/* Relancer */}
        <button
          type="button"
          onClick={relaunch}
          disabled={relaunching}
          class="w-full rounded-full border text-sm font-medium py-2 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          style={`border-color:${accentColor};color:${accentColor}`}
        >
          <span>{relaunching ? '…' : '↻'}</span>
          {relaunching ? 'Envoi en cours…' : `Relancer → ${agentLabel(assignee)}`}
        </button>

        {/* Supprimer */}
        {!confirmDelete ? (
          <button type="button" onClick={() => setConfirmDelete(true)} class="w-full rounded-full border border-red-200 text-red-400 text-sm font-medium py-2 hover:bg-red-50 transition-colors">
            Supprimer cette entrée
          </button>
        ) : (
          <div class="bg-red-50 rounded-xl p-3 space-y-2">
            <p class="text-xs text-red-600 text-center font-medium">Confirmer la suppression ?</p>
            <div class="flex gap-2">
              <button type="button" onClick={() => setConfirmDelete(false)} class="flex-1 rounded-full border border-gray-200 text-gray-500 text-xs py-1.5 hover:bg-gray-50">
                Annuler
              </button>
              <button type="button" onClick={deleteItem} disabled={deleting} class="flex-1 rounded-full bg-red-500 text-white text-xs py-1.5 disabled:opacity-50">
                {deleting ? 'Suppression…' : 'Confirmer'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// FORMULAIRES DE CRÉATION
// ═══════════════════════════════════════════════════════════════════════════
function RequestForm({ projects, onClose, onSuccess }: { projects: ProjectOption[]; onClose: () => void; onSuccess: () => void }) {
  const [projectId, setProjectId] = useState<string>(projects[0] ? String(projects[0].id) : '');
  const [title, setTitle]         = useState('');
  const [content, setContent]     = useState('');
  const [requestType, setRequestType] = useState('Fonctionnalite');
  const [priority, setPriority]   = useState('medium');
  const [assignee, setAssignee]   = useState('CHEF_TECHNIQUE');
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');

  async function handleSubmit(e: Event) {
    e.preventDefault(); setError('');
    if (!projectId) { setError('Sélectionnez un projet'); return; }
    if (title.trim().length < 2) { setError('Titre trop court'); return; }
    setLoading(true);
    try {
      const res = await fetch('/api/agent-proposals', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: Number(projectId), title: title.trim(), content: content.trim(), requestType, priority, assigneeAgentId: assignee }),
      });
      let data: any;
      try { data = await res.json(); }
      catch { throw new Error(`Erreur serveur (${res.status}) — réponse inattendue`); }
      if (!res.ok) throw new Error(data?.error || `Erreur ${res.status}`);
      onSuccess();
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  }

  return (
    <form onSubmit={handleSubmit} class="space-y-4">
      <div>
        <label class={LABEL_CLS}>Projet *</label>
        <select class={SELECT_CLS} value={projectId} onInput={(e) => setProjectId((e.target as HTMLSelectElement).value)} required>
          <option value="">— Sélectionner —</option>
          {projects.map(p => <option value={p.id}>{p.name}</option>)}
        </select>
      </div>
      <div>
        <label class={LABEL_CLS}>Titre *</label>
        <input class={INPUT_CLS} type="text" placeholder="Ex : Ajouter une page de profil" value={title} onInput={(e) => setTitle((e.target as HTMLInputElement).value)} required maxLength={500} />
      </div>
      <div>
        <label class={LABEL_CLS}>Description</label>
        <textarea class={`${INPUT_CLS} resize-none`} rows={3} placeholder="Détails…" value={content} onInput={(e) => setContent((e.target as HTMLTextAreaElement).value)} maxLength={8000} />
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class={LABEL_CLS}>Type</label>
          <select class={SELECT_CLS} value={requestType} onInput={(e) => setRequestType((e.target as HTMLSelectElement).value)}>
            <option value="Fonctionnalite">Fonctionnalité</option>
            <option value="Correction">Correction</option>
          </select>
        </div>
        <div>
          <label class={LABEL_CLS}>Priorité</label>
          <select class={SELECT_CLS} value={priority} onInput={(e) => setPriority((e.target as HTMLSelectElement).value)}>
            <option value="low">Basse</option>
            <option value="medium">Moyenne</option>
            <option value="high">Haute</option>
          </select>
        </div>
      </div>
      <div>
        <label class={LABEL_CLS}>Assigner à <span class="text-[10px] text-gray-400 font-normal">(défaut : Chef technique)</span></label>
        <AgentSelect value={assignee} onChange={setAssignee} />
      </div>
      {error && <p class="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
      <div class="flex gap-2 pt-1">
        <button type="button" onClick={onClose} class="flex-1 rounded-full border border-gray-200 text-gray-500 text-sm font-medium py-2 hover:bg-gray-50 transition-colors">Annuler</button>
        <button type="submit" disabled={loading} class="flex-1 rounded-full text-white text-sm font-medium py-2 disabled:opacity-50" style="background:#175B37">
          {loading ? 'Envoi…' : 'Créer la demande'}
        </button>
      </div>
    </form>
  );
}

function IssueForm({ projects, onClose, onSuccess }: { projects: ProjectOption[]; onClose: () => void; onSuccess: () => void }) {
  const [projectId, setProjectId] = useState('');
  const [title, setTitle]         = useState('');
  const [url, setUrl]             = useState('');
  const [errorType, setErrorType] = useState('bug');
  const [detail, setDetail]       = useState('');
  const [reportedBy, setReportedBy] = useState('HUMAIN');
  const [assignee, setAssignee]   = useState('CHEF_TECHNIQUE');
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');

  async function handleSubmit(e: Event) {
    e.preventDefault(); setError('');
    if (title.trim().length < 2) { setError('Titre trop court'); return; }
    if (!url.trim()) { setError('URL requise'); return; }
    setLoading(true);
    try {
      const res = await fetch('/api/agent-issues', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportedByAgentId: reportedBy.trim() || 'HUMAIN', url: url.trim(), errorType, title: title.trim(), detail: detail.trim() || undefined, projectId: projectId ? Number(projectId) : undefined, assigneeAgentId: assignee }),
      });
      let data: any;
      try { data = await res.json(); }
      catch { throw new Error(`Erreur serveur (${res.status}) — réponse inattendue`); }
      if (!res.ok) throw new Error(data?.error || `Erreur ${res.status}`);
      onSuccess();
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  }

  return (
    <form onSubmit={handleSubmit} class="space-y-4">
      <div>
        <label class={LABEL_CLS}>Titre *</label>
        <input class={INPUT_CLS} type="text" placeholder="Ex : Page 404 sur /projets/tesla" value={title} onInput={(e) => setTitle((e.target as HTMLInputElement).value)} required maxLength={500} />
      </div>
      <div>
        <label class={LABEL_CLS}>URL *</label>
        <input class={INPUT_CLS} type="text" placeholder="/chemin ou https://…" value={url} onInput={(e) => setUrl((e.target as HTMLInputElement).value)} required />
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class={LABEL_CLS}>Type</label>
          <select class={SELECT_CLS} value={errorType} onInput={(e) => setErrorType((e.target as HTMLSelectElement).value)}>
            <option value="bug">Bug</option>
            <option value="404">404</option>
            <option value="crash">Crash</option>
            <option value="performance">Performance</option>
            <option value="accessibility">Accessibilité</option>
            <option value="other">Autre</option>
          </select>
        </div>
        <div>
          <label class={LABEL_CLS}>Projet</label>
          <select class={SELECT_CLS} value={projectId} onInput={(e) => setProjectId((e.target as HTMLSelectElement).value)}>
            <option value="">— Aucun —</option>
            {projects.map(p => <option value={p.id}>{p.name}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label class={LABEL_CLS}>Détail</label>
        <textarea class={`${INPUT_CLS} resize-none`} rows={3} placeholder="Stack trace, contexte…" value={detail} onInput={(e) => setDetail((e.target as HTMLTextAreaElement).value)} maxLength={8000} />
      </div>
      <div>
        <label class={LABEL_CLS}>Rapporté par</label>
        <input class={INPUT_CLS} type="text" value={reportedBy} onInput={(e) => setReportedBy((e.target as HTMLInputElement).value)} maxLength={64} />
      </div>
      <div>
        <label class={LABEL_CLS}>Assigner à</label>
        <AgentSelect value={assignee} onChange={setAssignee} />
      </div>
      {error && <p class="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
      <div class="flex gap-2 pt-1">
        <button type="button" onClick={onClose} class="flex-1 rounded-full border border-gray-200 text-gray-500 text-sm font-medium py-2 hover:bg-gray-50 transition-colors">Annuler</button>
        <button type="submit" disabled={loading} class="flex-1 rounded-full text-white text-sm font-medium py-2 disabled:opacity-50" style="background:#EF4444">
          {loading ? 'Envoi…' : 'Signaler le bug'}
        </button>
      </div>
    </form>
  );
}

function DepForm({ projects, onClose, onSuccess }: { projects: ProjectOption[]; onClose: () => void; onSuccess: () => void }) {
  const [projectId, setProjectId]     = useState('');
  const [packageName, setPackageName] = useState('');
  const [versionSpec, setVersionSpec] = useState('');
  const [isDev, setIsDev]             = useState(false);
  const [reason, setReason]           = useState('');
  const [requestedBy, setRequestedBy] = useState('HUMAIN');
  const [assignee, setAssignee]       = useState('DEV_BACKEND');
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState('');

  async function handleSubmit(e: Event) {
    e.preventDefault(); setError('');
    if (!packageName.trim()) { setError('Nom du paquet requis'); return; }
    setLoading(true);
    try {
      const res = await fetch('/api/agent-dependencies', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestedByAgentId: requestedBy.trim() || 'HUMAIN', packageName: packageName.trim(), versionSpec: versionSpec.trim() || undefined, isDev: isDev ? 1 : 0, reason: reason.trim() || undefined, projectId: projectId ? Number(projectId) : undefined, assigneeAgentId: assignee }),
      });
      let data: any;
      try { data = await res.json(); }
      catch { throw new Error(`Erreur serveur (${res.status}) — réponse inattendue`); }
      if (!res.ok) throw new Error(data?.error || `Erreur ${res.status}`);
      onSuccess();
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  }

  return (
    <form onSubmit={handleSubmit} class="space-y-4">
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class={LABEL_CLS}>Paquet npm *</label>
          <input class={INPUT_CLS} type="text" placeholder="Ex : zod" value={packageName} onInput={(e) => setPackageName((e.target as HTMLInputElement).value)} required maxLength={128} />
        </div>
        <div>
          <label class={LABEL_CLS}>Version</label>
          <input class={INPUT_CLS} type="text" placeholder="^3.22.0" value={versionSpec} onInput={(e) => setVersionSpec((e.target as HTMLInputElement).value)} maxLength={64} />
        </div>
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class={LABEL_CLS}>Projet</label>
          <select class={SELECT_CLS} value={projectId} onInput={(e) => setProjectId((e.target as HTMLSelectElement).value)}>
            <option value="">— Aucun —</option>
            {projects.map(p => <option value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div class="flex items-end pb-1">
          <label class="flex items-center gap-2 cursor-pointer select-none">
            <input type="checkbox" class="w-4 h-4 rounded accent-[#175B37]" checked={isDev} onChange={(e) => setIsDev((e.target as HTMLInputElement).checked)} />
            <span class="text-sm text-gray-700">devDependency</span>
          </label>
        </div>
      </div>
      <div>
        <label class={LABEL_CLS}>Raison</label>
        <textarea class={`${INPUT_CLS} resize-none`} rows={3} placeholder="Pourquoi ce paquet…" value={reason} onInput={(e) => setReason((e.target as HTMLTextAreaElement).value)} maxLength={2000} />
      </div>
      <div>
        <label class={LABEL_CLS}>Demandé par</label>
        <input class={INPUT_CLS} type="text" value={requestedBy} onInput={(e) => setRequestedBy((e.target as HTMLInputElement).value)} maxLength={64} />
      </div>
      <div>
        <label class={LABEL_CLS}>Assigner à</label>
        <AgentSelect value={assignee} onChange={setAssignee} />
      </div>
      {error && <p class="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
      <div class="flex gap-2 pt-1">
        <button type="button" onClick={onClose} class="flex-1 rounded-full border border-gray-200 text-gray-500 text-sm font-medium py-2 hover:bg-gray-50 transition-colors">Annuler</button>
        <button type="submit" disabled={loading} class="flex-1 rounded-full text-white text-sm font-medium py-2 disabled:opacity-50" style="background:#3B82F6">
          {loading ? 'Envoi…' : 'Créer la demande'}
        </button>
      </div>
    </form>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MODAL SHELL
// ═══════════════════════════════════════════════════════════════════════════
const CREATE_META: Record<NonNullable<ModalType>, { title: string; accent: string; icon: string }> = {
  request: { title: 'Nouvelle demande',  accent: '#F59E0B', icon: '✦' },
  issue:   { title: 'Signaler un bug',   accent: '#EF4444', icon: '⚠' },
  dep:     { title: 'Dépendance npm',    accent: '#3B82F6', icon: '⬡' },
};

type ModalState =
  | { kind: 'create'; type: NonNullable<ModalType> }
  | { kind: 'detail'; item: WorkItem }
  | null;

export default function WorkModals({ projects }: WorkModalsProps) {
  const [modal, setModal]     = useState<ModalState>(null);
  const [success, setSuccess] = useState(false);
  const overlayRef            = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (window as any).__openWorkModal = (type: NonNullable<ModalType>) => {
      setSuccess(false);
      setModal({ kind: 'create', type });
    };
    // Appelé depuis le script inline de work.astro avec l'objet item déjà résolu
    (window as any).__openWorkDetailModal = (item: WorkItem) => {
      setSuccess(false);
      setModal({ kind: 'detail', item });
    };
    return () => {
      delete (window as any).__openWorkModal;
      delete (window as any).__openWorkDetailModal;
    };
  }, []);

  useEffect(() => {
    if (!modal) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setModal(null); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [modal]);

  function handleSuccess() {
    setSuccess(true);
    setTimeout(() => { setModal(null); setSuccess(false); window.location.reload(); }, 1200);
  }

  function closeModal() { setModal(null); setSuccess(false); }

  if (!modal) return null;

  const isCreate = modal.kind === 'create';
  const isDetail = modal.kind === 'detail';

  const accent = isCreate
    ? CREATE_META[modal.type].accent
    : modal.item._type === 'request' ? '#F59E0B'
    : modal.item._type === 'issue'   ? '#EF4444'
    : '#3B82F6';

  const icon = isCreate
    ? CREATE_META[modal.type].icon
    : modal.item._type === 'request' ? '✦'
    : modal.item._type === 'issue'   ? '⚠'
    : '⬡';

  const headerTitle = isCreate
    ? CREATE_META[modal.type].title
    : modal.item._type === 'request' ? 'Détail demande'
    : modal.item._type === 'issue'   ? 'Détail bug / anomalie'
    : 'Détail dépendance';

  return (
    <div
      ref={overlayRef}
      class="fixed inset-0 z-50 flex items-center justify-center p-4"
      style="background:rgba(0,0,0,0.35)"
      onClick={(e) => { if (e.target === overlayRef.current) closeModal(); }}
    >
      <div class="bg-white rounded-[1.5rem] shadow-xl w-full max-w-md" style="max-height:90vh;overflow-y:auto">
        {/* Header */}
        <div class="flex items-center gap-3 px-6 pt-6 pb-4 border-b border-gray-100">
          <div class="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0" style={`background:${accent}`}>
            {icon}
          </div>
          <h2 class="text-base font-bold text-gray-900 flex-1">{headerTitle}</h2>
          <button onClick={closeModal} class="w-7 h-7 rounded-full flex items-center justify-center text-gray-400 hover:bg-gray-100 transition-colors text-lg leading-none" aria-label="Fermer">×</button>
        </div>

        {/* Body */}
        <div class="px-6 py-5">
          {success ? (
            <div class="text-center py-8">
              <div class="text-4xl mb-3">✓</div>
              <p class="text-sm font-medium text-gray-700">Créé avec succès !</p>
              <p class="text-xs text-gray-400 mt-1">La page va se rafraîchir…</p>
            </div>
          ) : isDetail ? (
            <DetailModal
              item={modal.item}
              projects={projects}
              onClose={closeModal}
              onDeleted={() => { setModal(null); window.location.reload(); }}
              onUpdated={(patch) => {
                // Met à jour localement pour un feedback immédiat
                setModal({ kind: 'detail', item: { ...modal.item, ...patch } });
              }}
            />
          ) : modal.type === 'request' ? (
            <RequestForm projects={projects} onClose={closeModal} onSuccess={handleSuccess} />
          ) : modal.type === 'issue' ? (
            <IssueForm projects={projects} onClose={closeModal} onSuccess={handleSuccess} />
          ) : (
            <DepForm projects={projects} onClose={closeModal} onSuccess={handleSuccess} />
          )}
        </div>
      </div>
    </div>
  );
}
