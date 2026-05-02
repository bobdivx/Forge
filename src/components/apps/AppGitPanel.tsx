import { useState, useEffect } from 'preact/hooks';

type GitSummary = {
  isRepo: boolean;
  branch: string | null;
  dirty: boolean;
  aheadBehind: string | null;
  error: string | null;
};

type BranchPayload = {
  current: string;
  local: string[];
  remote: string[];
  error?: string;
};

type Props = {
  appName: string;
  initialGithubBranchDev?: string;
  initialGithubBranchProd?: string;
};

export default function AppGitPanel({
  appName,
  initialGithubBranchDev = 'dev',
  initialGithubBranchProd = 'main',
}: Props) {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const [summary, setSummary] = useState<GitSummary | null>(null);
  const [branches, setBranches] = useState<BranchPayload | null>(null);
  const [projectId, setProjectId] = useState<number | null>(null);
  const [githubTokenConfigured, setGithubTokenConfigured] = useState(false);

  const [devBranch, setDevBranch] = useState(initialGithubBranchDev);
  const [prodBranch, setProdBranch] = useState(initialGithubBranchProd);
  const [pushTarget, setPushTarget] = useState(initialGithubBranchDev);
  const [checkoutPick, setCheckoutPick] = useState('');
  const [commitMsg, setCommitMsg] = useState('');

  const base = `/api/projects/${encodeURIComponent(appName)}/git`;

  const load = async (opts?: { keepFeedback?: boolean; silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    if (!opts?.keepFeedback) setMessage(null);
    try {
      const res = await fetch(base);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage({ type: 'err', text: data.error || 'Chargement impossible' });
        return;
      }
      setSummary(data.summary ?? null);
      setBranches(data.branches ?? null);
      setProjectId(typeof data.projectId === 'number' ? data.projectId : null);
      setGithubTokenConfigured(Boolean(data.githubTokenConfigured));
      const d = String(data.githubBranchDev ?? initialGithubBranchDev).trim() || 'dev';
      const p = String(data.githubBranchProd ?? initialGithubBranchProd).trim() || 'main';
      setDevBranch(d);
      setProdBranch(p);
      setPushTarget(d);
    } catch {
      setMessage({ type: 'err', text: 'Erreur réseau' });
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [appName]);

  const mergedBranchChoices = () => {
    const set = new Set<string>();
    (branches?.local ?? []).forEach((b) => set.add(b));
    (branches?.remote ?? []).forEach((b) => set.add(b));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  };

  const saveDefaults = async () => {
    if (!projectId) {
      setMessage({ type: 'err', text: 'Projet non lié en base — lancez une sync depuis le dashboard.' });
      return;
    }
    setBusy('save');
    setMessage(null);
    try {
      const res = await fetch(base, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'set_branches',
          githubBranchDev: devBranch.trim(),
          githubBranchProd: prodBranch.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage({ type: 'err', text: data.error || 'Échec enregistrement' });
        return;
      }
      setMessage({ type: 'ok', text: 'Branches par défaut enregistrées.' });
      setPushTarget(devBranch.trim());
      await load({ keepFeedback: true, silent: true });
    } catch {
      setMessage({ type: 'err', text: 'Erreur réseau' });
    } finally {
      setBusy(null);
    }
  };

  const doCheckout = async () => {
    const b = checkoutPick.trim();
    if (!b) return;
    setBusy('checkout');
    setMessage(null);
    try {
      const res = await fetch(base, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'checkout', branch: b }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage({ type: 'err', text: data.error || 'Checkout impossible' });
        return;
      }
      setSummary(data.summary);
      setBranches(data.branches);
      setMessage({ type: 'ok', text: `Branche active : ${data.summary?.branch ?? b}` });
      window.location.reload(); /* historique / fichiers */
    } catch {
      setMessage({ type: 'err', text: 'Erreur réseau' });
    } finally {
      setBusy(null);
    }
  };

  const doPull = async () => {
    setBusy('pull');
    setMessage(null);
    try {
      const branch = summary?.branch || devBranch;
      const res = await fetch(base, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'pull', branch }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage({ type: 'err', text: data.error || data.stdout || 'Pull échoué' });
        if (data.summary) setSummary(data.summary);
        if (data.branches) setBranches(data.branches);
        return;
      }
      setSummary(data.summary);
      setBranches(data.branches);
      setMessage({ type: 'ok', text: data.stdout?.trim().slice(0, 400) || 'Pull terminé.' });
      await load({ keepFeedback: true, silent: true });
    } catch {
      setMessage({ type: 'err', text: 'Erreur réseau' });
    } finally {
      setBusy(null);
    }
  };

  const doCommit = async () => {
    setBusy('commit');
    setMessage(null);
    try {
      const res = await fetch(base, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'commit', message: commitMsg }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage({ type: 'err', text: data.error || 'Commit refusé' });
        return;
      }
      if (!data.committed) {
        setMessage({ type: 'ok', text: 'Rien à committer (arbre propre).' });
      } else {
        setMessage({ type: 'ok', text: `Commit ${data.shortSha || ''} enregistré.` });
      }
      setCommitMsg('');
      await load({ keepFeedback: true, silent: true });
    } catch {
      setMessage({ type: 'err', text: 'Erreur réseau' });
    } finally {
      setBusy(null);
    }
  };

  const doPush = async () => {
    setBusy('push');
    setMessage(null);
    try {
      const res = await fetch(base, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'push', targetBranch: pushTarget.trim() || devBranch }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage({ type: 'err', text: data.error || data.stdout || 'Push échoué' });
        if (data.summary) setSummary(data.summary);
        if (data.branches) setBranches(data.branches);
        return;
      }
      setSummary(data.summary);
      setBranches(data.branches);
      setMessage({ type: 'ok', text: data.stdout?.trim().slice(0, 400) || `Push vers origin/${data.targetBranch || pushTarget}.` });
      await load({ keepFeedback: true, silent: true });
    } catch {
      setMessage({ type: 'err', text: 'Erreur réseau' });
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return (
      <div class="bg-white rounded-[1.5rem] shadow-sm border border-gray-100 p-6 text-sm text-gray-400 animate-pulse">
        Chargement Git…
      </div>
    );
  }

  if (!summary?.isRepo) {
    return (
      <div class="bg-amber-50 rounded-[1.5rem] border border-amber-100 p-5 text-sm text-amber-900">
        Pas de dépôt Git dans ce dossier — impossible d’utiliser branches / pull / push.
      </div>
    );
  }

  const choices = mergedBranchChoices();

  return (
    <div class="bg-white rounded-[1.5rem] shadow-sm border border-gray-100 p-6 space-y-5">
      <div class="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h3 class="text-base font-semibold text-gray-900 flex items-center gap-2">
            <span class="text-lg" aria-hidden>
              🌿
            </span>
            Git & GitHub
          </h3>
          <p class="text-xs text-gray-400 mt-0.5">
            Branche active :{' '}
            <span class="font-mono font-semibold text-[#175B37]">{summary.branch || '—'}</span>
            {summary.dirty && <span class="text-amber-600 ml-2">● modifications locales</span>}
            {summary.aheadBehind && (
              <span class="font-mono text-gray-500 ml-2">{summary.aheadBehind}</span>
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          class="text-xs font-medium text-gray-400 hover:text-gray-700 self-start"
        >
          Actualiser
        </button>
      </div>

      {!githubTokenConfigured && (
        <p class="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
          Jeton GitHub non configuré : pull/push vers origin utilisent l’authentification Forge — ajoutez un token dans{' '}
          <a href="/settings#api" class="underline font-medium">
            Paramètres → Jetons API
          </a>
          .
        </p>
      )}

      {message && (
        <div
          class={`rounded-xl px-4 py-3 text-xs ${
            message.type === 'ok'
              ? 'bg-green-50 border border-green-100 text-green-800'
              : 'bg-red-50 border border-red-100 text-red-700'
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Branches par défaut Forge */}
      <div class="rounded-xl border border-gray-100 bg-gray-50/80 p-4 space-y-3">
        <p class="text-xs font-semibold text-gray-700 uppercase tracking-wide">Branches par défaut (Forge)</p>
        <p class="text-[11px] text-gray-500">
          Utilisées par les outils agents (push cible, prod). Dev = branche de travail habituelle.
        </p>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label class="block space-y-1">
            <span class="text-[10px] font-bold text-gray-400 uppercase">Dev</span>
            <input
              type="text"
              value={devBranch}
              onInput={(e) => setDevBranch((e.target as HTMLInputElement).value)}
              class="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm font-mono text-gray-900"
              disabled={!projectId}
            />
          </label>
          <label class="block space-y-1">
            <span class="text-[10px] font-bold text-gray-400 uppercase">Prod</span>
            <input
              type="text"
              value={prodBranch}
              onInput={(e) => setProdBranch((e.target as HTMLInputElement).value)}
              class="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm font-mono text-gray-900"
              disabled={!projectId}
            />
          </label>
        </div>
        <button
          type="button"
          disabled={Boolean(busy) || !projectId}
          onClick={() => void saveDefaults()}
          class="text-xs font-semibold px-4 py-2 rounded-full border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-40"
        >
          {busy === 'save' ? '…' : 'Enregistrer les défauts'}
        </button>
        {!projectId && (
          <p class="text-[11px] text-amber-700">Sync projet requis pour persister ces champs en base.</p>
        )}
      </div>

      {/* Checkout */}
      <div class="space-y-2">
        <p class="text-xs font-semibold text-gray-700">Changer de branche locale</p>
        <div class="flex flex-col sm:flex-row gap-2">
          <select
            class="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900"
            value={checkoutPick}
            onChange={(e) => setCheckoutPick((e.target as HTMLSelectElement).value)}
          >
            <option value="">— Choisir une branche —</option>
            {choices.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={Boolean(busy) || !checkoutPick}
            onClick={() => void doCheckout()}
            class="rounded-full px-4 py-2 text-sm font-semibold border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-40"
          >
            {busy === 'checkout' ? '…' : 'Checkout'}
          </button>
        </div>
      </div>

      {/* Pull / Commit / Push */}
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div class="rounded-xl border border-gray-100 p-4 space-y-2">
          <p class="text-xs font-bold text-gray-800">Récupérer (pull)</p>
          <p class="text-[10px] text-gray-500">git pull origin {summary.branch || '…'}</p>
          <button
            type="button"
            disabled={Boolean(busy)}
            onClick={() => void doPull()}
            class="w-full rounded-full py-2 text-sm font-semibold text-white disabled:opacity-40"
            style="background:#175B37"
          >
            {busy === 'pull' ? '…' : 'Pull'}
          </button>
        </div>
        <div class="rounded-xl border border-gray-100 p-4 space-y-2">
          <p class="text-xs font-bold text-gray-800">Commit</p>
          <textarea
            value={commitMsg}
            onInput={(e) => setCommitMsg((e.target as HTMLTextAreaElement).value)}
            placeholder="Message (tous les fichiers suivis)"
            class="w-full min-h-[72px] text-xs bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-gray-900"
          />
          <button
            type="button"
            disabled={Boolean(busy) || commitMsg.trim().length < 2}
            onClick={() => void doCommit()}
            class="w-full rounded-full py-2 text-sm font-semibold border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-40"
          >
            {busy === 'commit' ? '…' : 'Commit (git add -A)'}
          </button>
        </div>
        <div class="rounded-xl border border-gray-100 p-4 space-y-2">
          <p class="text-xs font-bold text-gray-800">Pousser (push)</p>
          <label class="block text-[10px] text-gray-500 space-y-1">
            Branche distante cible
            <input
              type="text"
              value={pushTarget}
              onInput={(e) => setPushTarget((e.target as HTMLInputElement).value)}
              class="w-full font-mono text-xs bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-gray-900"
            />
          </label>
          <button
            type="button"
            disabled={Boolean(busy)}
            onClick={() => void doPush()}
            class="w-full rounded-full py-2 text-sm font-semibold text-white disabled:opacity-40"
            style="background:#175B37"
          >
            {busy === 'push' ? '…' : 'Push HEAD → origin'}
          </button>
        </div>
      </div>
    </div>
  );
}
