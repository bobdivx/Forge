import type { ChatMessage, AgentRow, Project, RequestItem } from './types';

export type SlashCommandContext = {
  agentId: string;
  discussionThreadKey: string;
  projectId: string;
  requestId: string;
  agents: AgentRow[];
  projects: Project[];
  requests: RequestItem[];
  setMessage: (v: string | ((p: string) => string)) => void;
  setDiscussionThreadKey: (k: string) => void;
  setProjectId: (id: string) => void;
  setRequestId: (id: string) => void;
  setCurrentSteps: (steps: unknown[]) => void;
  setError: (e: string | null) => void;
  appendSystemMessages: (messages: ChatMessage[]) => void;
  pickSession: (id: string, opts?: { systemNote?: string }) => Promise<void>;
  reloadContext: () => Promise<void>;
  onModelChange: (agentId: string, model: string) => Promise<void>;
};

export type SlashHandleResult = { kind: 'handled' } | { kind: 'forward' };

const HELP_TEXT = `Commandes Forge (/)

• /help — cette aide
• /new | /reset | /clear — nouveau fil de discussion (session séparée en base)
• /thread — affiche la clé de fil courante
• /refresh — recharge projets, demandes et agents
• /agents — liste les agents (aperçu)
• /pick <ID> — sélectionne un agent (ex: /pick CHEF_TECHNIQUE)
• /models — modèles utilisables (actifs)
• /model [id] — sans argument : modèle courant ; avec : applique au agent sélectionné
• /default-model [id] — lit ou définit le modèle équipe (Config)
• /project <id|clear> — contexte projet lié au chat
• /request <id|clear> — demande liée au chat
• /projects — liste locale des projets (idem barre latérale, /refresh si vide)
• /requests | /demandes — liste locale des demandes
• /health — santé Gateway ZimaOS
• /version — version Forge + mise à jour dispo
• /status | /system — CPU / mémoire / disques / conteneurs unhealthy
• /docker — conteneurs Docker (docker ps -a format court)
• /ollama — instances Ollama configurées + sonde rapide
• /gemini — modèles Gemini (clé configurée)
• /repos — santé forgeReposRoot + sonde ZimaOS (JSON tronqué)
• /swarm — stats sessions ZimaOS (via /api/forge-swarm-stats)
• /tasks [n] — dernières tâches agents (défaut 15, max 60)
• /rules — règles agent + aperçu projets (GET /api/agent-rules)
• /prompt | /instructions [AGENT] — instructions système (agent courant ou id)
• /doctrine — doctrine d’action (session requise si 401)
• /me | /whoami — utilisateur courant (/api/auth/me)
• /assignments | /tools-agent — outils assignés à l’agent sélectionné (session requise si 401)
• /tools — aperçu du catalogue d’outils
• /spawn — sous-agent projet (parent = agent courant, nécessite /project)
• /wake — POST /api/forge-wake-agents
• /sync — aperçu GET /api/forge-sync-agents

Astuce : Ctrl+Entrée envoie le message. Les /commandes non reconnues partent au modèle.`;

function nowAt(): string {
  return new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function clipJson(obj: unknown, max = 2800): string {
  try {
    const s = JSON.stringify(obj);
    if (s.length <= max) return s;
    return `${s.slice(0, max)}…`;
  } catch {
    return String(obj).slice(0, max);
  }
}

function sys(text: string): ChatMessage {
  return {
    id: `sys-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role: 'system',
    text,
    at: nowAt(),
  };
}

export async function handleDiscussionSlashCommand(
  rawText: string,
  ctx: SlashCommandContext,
): Promise<SlashHandleResult> {
  const text = rawText.trim();
  if (!text.startsWith('/')) return { kind: 'forward' };

  const parts = text.split(/\s+/);
  const cmd0 = parts[0] || '';
  const cmd = cmd0.toLowerCase();
  const rest = parts.slice(1);
  const arg1 = rest[0]?.trim() || '';
  const argRest = rest.join(' ').trim();

  const push = (t: string) => {
    ctx.setMessage('');
    ctx.appendSystemMessages([sys(t)]);
  };

  try {
    if (cmd === '/help' || cmd === '/aide' || cmd === '/?') {
      push(HELP_TEXT);
      return { kind: 'handled' };
    }

    if (cmd === '/new' || cmd === '/reset' || cmd === '/clear') {
      if (!ctx.agentId) {
        push('Sélectionne un agent dans la barre latérale avant /new.');
        return { kind: 'handled' };
      }
      ctx.setMessage('');
      const suffix =
        typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.randomUUID === 'function'
          ? globalThis.crypto.randomUUID()
          : String(Date.now());
      const nk = `${ctx.agentId}__${suffix}`;
      ctx.setDiscussionThreadKey(nk);
      ctx.setCurrentSteps([]);
      ctx.setError(null);
      ctx.appendSystemMessages([
        sys(
          `Nouveau fil : ${nk}. L’historique du fil précédent reste en base ; re-cliquer l’agent recharge le fil par défaut (clé = id agent).`,
        ),
      ]);
      return { kind: 'handled' };
    }

    if (cmd === '/thread') {
      ctx.setMessage('');
      const k = ctx.discussionThreadKey || ctx.agentId || '(aucun)';
      ctx.appendSystemMessages([sys(`Fil courant : ${k}`)]);
      return { kind: 'handled' };
    }

    if (cmd === '/refresh') {
      ctx.setMessage('');
      await ctx.reloadContext();
      ctx.appendSystemMessages([sys('Contexte rechargé (projets, demandes, agents, profils).')]);
      return { kind: 'handled' };
    }

    if (cmd === '/agents') {
      ctx.setMessage('');
      const rows = ctx.agents.length
        ? ctx.agents.map((a) => `• ${a.id} — modèle ${a.model || '—'} — ${a.status || '?'}`).join('\n')
        : '(aucun agent — essaie /refresh)';
      ctx.appendSystemMessages([sys(`Agents (${ctx.agents.length}) :\n${rows}`)]);
      return { kind: 'handled' };
    }

    if (cmd === '/pick') {
      if (!arg1) {
        push('Usage : /pick CHEF_TECHNIQUE');
        return { kind: 'handled' };
      }
      const id = arg1.toUpperCase().replace(/[^A-Z0-9_]/g, '_');
      const found = ctx.agents.some((a) => a.id === id);
      if (!found) {
        push(`Agent inconnu : ${id}. Utilise /refresh ou vérifie l’identifiant exact.`);
        return { kind: 'handled' };
      }
      ctx.setMessage('');
      await ctx.pickSession(id, { systemNote: `Agent sélectionné : ${id}` });
      return { kind: 'handled' };
    }

    if (cmd === '/models') {
      ctx.setMessage('');
      const res = await fetch('/api/models?filter=active');
      const data = await res.json().catch(() => []);
      const list = Array.isArray(data) ? data : [];
      const lines = list.slice(0, 55).map((m: { id?: string; ownedBy?: string }) => {
        const id = String(m?.id || '');
        const ob = String(m?.ownedBy || '');
        return `• ${id}${ob ? ` (${ob})` : ''}`;
      });
      const more =
        list.length > 55 ? `\n… +${list.length - 55} autres (Paramètres → IA pour la liste complète).` : '';
      ctx.appendSystemMessages([sys(`Modèles actifs (${list.length}) :\n${lines.join('\n')}${more}`)]);
      return { kind: 'handled' };
    }

    if (cmd === '/model') {
      if (!ctx.agentId) {
        push('Sélectionne un agent.');
        return { kind: 'handled' };
      }
      ctx.setMessage('');
      if (!argRest) {
        const cur = ctx.agents.find((a) => a.id === ctx.agentId);
        ctx.appendSystemMessages([
          sys(`Modèle de ${ctx.agentId} : ${cur?.model || '—'}\nUsage : /model qwen2.5:7b`),
        ]);
        return { kind: 'handled' };
      }
      const newModel = argRest.trim();
      await ctx.onModelChange(ctx.agentId, newModel);
      ctx.appendSystemMessages([sys(`Requête appliquée : ${ctx.agentId} → ${newModel} (vérifie /agents si besoin).`)]);
      await ctx.reloadContext();
      return { kind: 'handled' };
    }

    if (cmd === '/default-model') {
      ctx.setMessage('');
      if (!argRest) {
        const res = await fetch('/api/agent-default-model');
        const j = (await res.json().catch(() => ({}))) as { model?: string; error?: string };
        ctx.appendSystemMessages([sys(`Modèle équipe par défaut : ${String(j.model ?? j.error ?? '—')}`)]);
        return { kind: 'handled' };
      }
      const res = await fetch('/api/agent-default-model', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: argRest }),
      });
      const j = (await res.json().catch(() => ({}))) as { model?: string; error?: string };
      if (!res.ok) {
        ctx.appendSystemMessages([sys(`Erreur : ${String(j.error || res.status)}`)]);
      } else {
        ctx.appendSystemMessages([sys(`Modèle équipe défini : ${String(j.model || argRest)}`)]);
      }
      return { kind: 'handled' };
    }

    if (cmd === '/project') {
      ctx.setMessage('');
      if (!arg1 || arg1.toLowerCase() === 'clear' || arg1 === '-') {
        ctx.setProjectId('');
        ctx.appendSystemMessages([sys('Projet de contexte effacé.')]);
        return { kind: 'handled' };
      }
      const n = parseInt(arg1, 10);
      if (!Number.isFinite(n)) {
        ctx.appendSystemMessages([sys('Usage : /project 12 ou /project clear')]);
        return { kind: 'handled' };
      }
      const p = ctx.projects.find((x) => x.id === n);
      if (!p) {
        ctx.appendSystemMessages([sys(`Projet #${n} introuvable. Essaie /refresh.`)]);
        return { kind: 'handled' };
      }
      ctx.setProjectId(String(n));
      ctx.appendSystemMessages([sys(`Projet de contexte : #${n} — ${p.name}`)]);
      return { kind: 'handled' };
    }

    if (cmd === '/request') {
      ctx.setMessage('');
      if (!arg1 || arg1.toLowerCase() === 'clear' || arg1 === '-') {
        ctx.setRequestId('');
        ctx.appendSystemMessages([sys('Demande liée effacée.')]);
        return { kind: 'handled' };
      }
      const n = parseInt(arg1, 10);
      if (!Number.isFinite(n)) {
        ctx.appendSystemMessages([sys('Usage : /request 42 ou /request clear')]);
        return { kind: 'handled' };
      }
      const r = ctx.requests.find((x) => x.id === n);
      if (!r) {
        ctx.appendSystemMessages([sys(`Demande #${n} absente de la liste locale. /refresh puis réessaie.`)]);
        return { kind: 'handled' };
      }
      ctx.setRequestId(String(n));
      ctx.appendSystemMessages([sys(`Demande liée : #${n} — ${r.title || 'sans titre'}`)]);
      return { kind: 'handled' };
    }

    if (cmd === '/health') {
      ctx.setMessage('');
      const res = await fetch('/api/forge-health');
      const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      const lines = [
        `reachable: ${String(j.reachable ?? '—')}`,
        j.gatewayUrl ? `gatewayUrl: ${j.gatewayUrl}` : '',
        j.sessionCount != null ? `sessionCount: ${j.sessionCount}` : '',
        j.runningCount != null ? `runningCount: ${j.runningCount}` : '',
        j.error ? `error: ${j.error}` : '',
        j.hint ? `hint: ${j.hint}` : '',
        j.via ? `via: ${j.via}` : '',
      ].filter(Boolean);
      ctx.appendSystemMessages([
        sys(
          lines.length
            ? `Forge / Gateway :\n${lines.join('\n')}`
            : `Réponse brute :\n${JSON.stringify(j).slice(0, 1800)}`,
        ),
      ]);
      return { kind: 'handled' };
    }

    if (cmd === '/version') {
      ctx.setMessage('');
      const res = await fetch('/api/app-version');
      const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      ctx.appendSystemMessages([
        sys(
          [
            `Version courante : ${String(j.currentVersion ?? '—')}`,
            j.latestVersion ? `Dernière connue : ${String(j.latestVersion)}` : '',
            j.updateAvailable ? 'Mise à jour disponible sur la release Forge.' : '',
          ]
            .filter(Boolean)
            .join('\n'),
        ),
      ]);
      return { kind: 'handled' };
    }

    if (cmd === '/tools') {
      ctx.setMessage('');
      const res = await fetch('/api/agent-tools');
      const j = (await res.json().catch(() => ({}))) as { tools?: { name?: string }[]; error?: string };
      if (!res.ok) {
        ctx.appendSystemMessages([sys(`Erreur /api/agent-tools : ${String(j.error || res.status)}`)]);
        return { kind: 'handled' };
      }
      const tools = Array.isArray(j.tools) ? j.tools : [];
      const names = tools
        .slice(0, 30)
        .map((t) => String(t.name || ''))
        .filter(Boolean);
      const more = tools.length > 30 ? `\n… +${tools.length - 30} outils.` : '';
      ctx.appendSystemMessages([sys(`Catalogue : ${tools.length} outil(s)\n${names.join(', ')}${more}`)]);
      return { kind: 'handled' };
    }

    if (cmd === '/spawn') {
      if (!ctx.agentId) {
        push('Sélectionne un agent parent.');
        return { kind: 'handled' };
      }
      const pid = parseInt(ctx.projectId, 10);
      if (!ctx.projectId || !Number.isFinite(pid)) {
        push('Définis un projet : /project <id> puis /spawn');
        return { kind: 'handled' };
      }
      ctx.setMessage('');
      const res = await fetch('/api/spawn-project-agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parentAgentId: ctx.agentId, projectId: pid }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        ctx.appendSystemMessages([sys(`Spawn échoué : ${String((j as { error?: string }).error || res.status)}`)]);
      } else {
        ctx.appendSystemMessages([sys(`Provisionnement : ${JSON.stringify(j).slice(0, 1400)}`)]);
        await ctx.reloadContext();
      }
      return { kind: 'handled' };
    }

    if (cmd === '/wake') {
      ctx.setMessage('');
      const res = await fetch('/api/forge-wake-agents', { method: 'POST' });
      const j = await res.json().catch(() => ({}));
      ctx.appendSystemMessages([
        sys(
          res.ok
            ? `Wake agents : ${JSON.stringify(j).slice(0, 1600)}`
            : `Erreur wake : ${String((j as { error?: string }).error || res.status)}`,
        ),
      ]);
      await ctx.reloadContext();
      return { kind: 'handled' };
    }

    if (cmd === '/sync') {
      ctx.setMessage('');
      const res = await fetch('/api/forge-sync-agents');
      const j = await res.json().catch(() => ({}));
      ctx.appendSystemMessages([sys(`Sync agents (GET aperçu) :\n${JSON.stringify(j).slice(0, 2600)}`)]);
      return { kind: 'handled' };
    }

    if (cmd === '/projects') {
      ctx.setMessage('');
      const ps = ctx.projects;
      if (!ps.length) {
        ctx.appendSystemMessages([
          sys('Aucun projet en contexte local — exécute /refresh ou ouvre le hub projets.'),
        ]);
        return { kind: 'handled' };
      }
      const lines = ps
        .slice(0, 45)
        .map((p) => `• #${p.id} — ${p.name || 'sans nom'}`)
        .join('\n');
      const more = ps.length > 45 ? `\n… +${ps.length - 45} autres.` : '';
      ctx.appendSystemMessages([sys(`Projets (${ps.length}) :\n${lines}${more}`)]);
      return { kind: 'handled' };
    }

    if (cmd === '/requests' || cmd === '/demandes') {
      ctx.setMessage('');
      const rs = ctx.requests;
      if (!rs.length) {
        ctx.appendSystemMessages([sys('Aucune demande en contexte local — /refresh.')]);
        return { kind: 'handled' };
      }
      const lines = rs
        .slice(0, 45)
        .map((r) => `• #${r.id} — ${r.title || 'sans titre'}`)
        .join('\n');
      const more = rs.length > 45 ? `\n… +${rs.length - 45} autres.` : '';
      ctx.appendSystemMessages([sys(`Demandes (${rs.length}) :\n${lines}${more}`)]);
      return { kind: 'handled' };
    }

    if (cmd === '/status' || cmd === '/system') {
      ctx.setMessage('');
      const res = await fetch('/api/system-status');
      const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) {
        ctx.appendSystemMessages([sys(`Erreur /api/system-status : ${res.status}`)]);
        return { kind: 'handled' };
      }
      const unhealthy = Array.isArray(j.unhealthyContainers) ? (j.unhealthyContainers as string[]) : [];
      const lines = [
        j.platform != null ? `plateforme : ${String(j.platform)}` : '',
        j.memoryUsage != null ? `mémoire utilisée ~${String(j.memoryUsage)}%` : '',
        j.cpuLoad != null ? `charge CPU ~${String(j.cpuLoad)}%` : '',
        j.diskUsage != null ? `disque /mnt/Docker ~${String(j.diskUsage)}%` : '',
        j.githubDiskUsage != null ? `disque GitHub ~${String(j.githubDiskUsage)}%` : '',
        j.uptime != null ? `uptime (s) : ${String(j.uptime)}` : '',
        j.note ? `note : ${String(j.note)}` : '',
        unhealthy.length ? `conteneurs unhealthy : ${unhealthy.join(', ')}` : '',
        j.lastMaintenance != null ? `dernier cycle maintenance : ${String(j.lastMaintenance)}` : '',
      ].filter(Boolean);
      ctx.appendSystemMessages([
        sys(lines.length ? `État système :\n${lines.join('\n')}` : clipJson(j, 2200)),
      ]);
      return { kind: 'handled' };
    }

    if (cmd === '/docker') {
      ctx.setMessage('');
      const res = await fetch('/api/docker-health');
      const j = (await res.json().catch(() => ({}))) as { containers?: unknown[]; error?: string };
      if (!res.ok) {
        ctx.appendSystemMessages([sys(`Docker : ${String(j.error || res.status)}`)]);
        return { kind: 'handled' };
      }
      const arr = Array.isArray(j.containers) ? j.containers : [];
      const lines = arr.slice(0, 18).map((c) => {
        const row = c as { Names?: string; name?: string; State?: string; Status?: string; Image?: string };
        const name = String(row.Names ?? row.name ?? '?');
        const st = String(row.State ?? row.Status ?? '');
        const img = String(row.Image ?? '');
        return `• ${name} — ${st}${img ? ` (${img})` : ''}`;
      });
      const more = arr.length > 18 ? `\n… +${arr.length - 18} conteneurs.` : '';
      ctx.appendSystemMessages([
        sys(`Docker (${arr.length} conteneur(s), affichage 18 max) :\n${lines.join('\n')}${more}`),
      ]);
      return { kind: 'handled' };
    }

    if (cmd === '/ollama') {
      ctx.setMessage('');
      const res = await fetch('/api/ollama-instances');
      const rows = (await res.json().catch(() => [])) as {
        name?: string;
        id?: number;
        url?: string;
        normalizedUrl?: string;
        health?: { ok?: boolean; models?: string[]; endpoint?: string; error?: string; status?: number } | null;
      }[];
      if (!res.ok) {
        ctx.appendSystemMessages([sys(`Ollama : erreur HTTP ${res.status}`)]);
        return { kind: 'handled' };
      }
      if (!Array.isArray(rows) || !rows.length) {
        ctx.appendSystemMessages([sys('Aucune instance Ollama en base — Paramètres → instances.')]);
        return { kind: 'handled' };
      }
      const lines = rows.slice(0, 12).map((r) => {
        const name = String(r.name || r.id || '?');
        const url = String(r.normalizedUrl || r.url || '');
        const h = r.health;
        let tail = '';
        if (h == null) tail = ' (désactivée)';
        else if (h.ok) {
          const mc = Array.isArray(h.models) ? h.models.length : 0;
          tail = ` OK — ${mc} modèle(s) (${h.endpoint || ''})`;
        } else tail = ` KO — ${h.error || `HTTP ${h.status}`}`;
        return `• ${name} — ${url}${tail}`;
      });
      const more = rows.length > 12 ? `\n… +${rows.length - 12} instance(s).` : '';
      ctx.appendSystemMessages([sys(`Instances Ollama :\n${lines.join('\n')}${more}`)]);
      return { kind: 'handled' };
    }

    if (cmd === '/gemini') {
      ctx.setMessage('');
      const res = await fetch('/api/gemini-models');
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        configured?: boolean;
        models?: { id?: string }[];
        error?: string;
      };
      if (!j.configured) {
        ctx.appendSystemMessages([
          sys(`Gemini : ${String(j.error || 'non configuré')} (clé API / activation).`),
        ]);
        return { kind: 'handled' };
      }
      const models = Array.isArray(j.models) ? j.models : [];
      const ids = models.slice(0, 40).map((m) => String(m.id || '').trim()).filter(Boolean);
      const more = models.length > 40 ? `\n… +${models.length - 40} modèles.` : '';
      ctx.appendSystemMessages([
        sys(
          `Gemini (${j.ok === false ? 'erreur API — ' : ''}${models.length} modèle(s)) :\n${ids.join(', ')}${more}`,
        ),
      ]);
      if (j.error && j.ok === false) {
        ctx.appendSystemMessages([sys(`Détail : ${j.error}`)]);
      }
      return { kind: 'handled' };
    }

    if (cmd === '/repos') {
      ctx.setMessage('');
      const res = await fetch('/api/forge-repos-health');
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        ctx.appendSystemMessages([
          sys(`forge-repos-health : ${String((j as { error?: string }).error || res.status)}`),
        ]);
        return { kind: 'handled' };
      }
      ctx.appendSystemMessages([sys(`Santé dépôts Forge :\n${clipJson(j, 3200)}`)]);
      return { kind: 'handled' };
    }

    if (cmd === '/swarm') {
      ctx.setMessage('');
      const res = await fetch('/api/forge-swarm-stats');
      const j = await res.json().catch(() => ({}));
      ctx.appendSystemMessages([sys(`Swarm / stats :\n${clipJson(j, 3000)}`)]);
      return { kind: 'handled' };
    }

    if (cmd === '/tasks') {
      ctx.setMessage('');
      let lim = 15;
      if (arg1) {
        const n = parseInt(arg1, 10);
        if (Number.isFinite(n)) lim = Math.min(60, Math.max(5, n));
      }
      const res = await fetch(`/api/agent-tasks?limit=${lim}`);
      const j = (await res.json().catch(() => ({}))) as {
        tasks?: { id?: unknown; agentId?: string; task?: string; status?: string }[];
      };
      if (!res.ok) {
        ctx.appendSystemMessages([sys(`agent-tasks : ${res.status}`)]);
        return { kind: 'handled' };
      }
      const tasks = Array.isArray(j.tasks) ? j.tasks : [];
      if (!tasks.length) {
        ctx.appendSystemMessages([sys('Aucune tâche en base.')]);
        return { kind: 'handled' };
      }
      const lines = tasks.map(
        (t) => `• #${t.id} ${t.agentId || '?'} — ${t.status || '?'} — ${String(t.task || '').slice(0, 120)}`,
      );
      ctx.appendSystemMessages([sys(`Tâches (≤${lim}) :\n${lines.join('\n')}`)]);
      return { kind: 'handled' };
    }

    if (cmd === '/rules') {
      ctx.setMessage('');
      const res = await fetch('/api/agent-rules');
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        rules?: { id?: string; title?: string; pattern?: string }[];
        projects?: { id?: number; name?: string }[];
        error?: string;
      };
      if (!res.ok) {
        ctx.appendSystemMessages([sys(`agent-rules : ${res.status}`)]);
        return { kind: 'handled' };
      }
      const rules = Array.isArray(j.rules) ? j.rules : [];
      const pr = Array.isArray(j.projects) ? j.projects : [];
      const rLines =
        rules.slice(0, 25).map((r) => `• ${String(r.id || r.title || r.pattern || '?')}`).join('\n') ||
        '(aucune règle)';
      const pLines = pr
        .slice(0, 12)
        .map((p) => `• #${p.id} — ${p.name || ''}`)
        .join('\n');
      ctx.appendSystemMessages([
        sys(`Règles (${rules.length}) :\n${rLines}${rules.length > 25 ? `\n… +${rules.length - 25}` : ''}\n\nProjets API (${pr.length}) :\n${pLines || '(liste vide)'}${j.error ? `\n\nErreur : ${j.error}` : ''}`),
      ]);
      return { kind: 'handled' };
    }

    if (cmd === '/prompt' || cmd === '/instructions') {
      ctx.setMessage('');
      const targetId = argRest ? argRest.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_') : ctx.agentId;
      if (!targetId) {
        ctx.appendSystemMessages([
          sys('Usage : /prompt AGENT_ID ou sélectionne un agent pour voir son prompt.'),
        ]);
        return { kind: 'handled' };
      }
      const res = await fetch(`/api/agent-instructions?id=${encodeURIComponent(targetId)}`);
      const row = await res.json().catch(() => ({}));
      if (!res.ok) {
        ctx.appendSystemMessages([
          sys(`Instructions ${targetId} : ${String((row as { error?: string }).error || res.status)}`),
        ]);
        return { kind: 'handled' };
      }
      const r = row as { agentId?: string; model?: string; systemPrompt?: string };
      const preview = String(r.systemPrompt || '').replace(/\s+/g, ' ').trim().slice(0, 900);
      ctx.appendSystemMessages([
        sys(
          `Agent ${r.agentId || targetId} — modèle ${r.model || '—'}\n\n${preview || '(prompt vide)'}${
            String(r.systemPrompt || '').length > 900 ? '…' : ''
          }`,
        ),
      ]);
      return { kind: 'handled' };
    }

    if (cmd === '/doctrine') {
      ctx.setMessage('');
      const res = await fetch('/api/agent-action-doctrine');
      const j = await res.json().catch(() => ({}));
      if (res.status === 401) {
        ctx.appendSystemMessages([
          sys('Doctrine : connexion web requise (401). Ouvre le tableau de bord ou réessaie depuis une session authentifiée.'),
        ]);
        return { kind: 'handled' };
      }
      if (!res.ok) {
        ctx.appendSystemMessages([
          sys(`Doctrine : ${String((j as { error?: string }).error || res.status)}`),
        ]);
        return { kind: 'handled' };
      }
      const d = (j as { doctrine?: string }).doctrine || '';
      const preview = d.replace(/\s+/g, ' ').trim().slice(0, 1200);
      ctx.appendSystemMessages([
        sys(
          `Doctrine d’action (extrait) :\n${preview || '(vide)'}${d.length > 1200 ? '…' : ''}`,
        ),
      ]);
      return { kind: 'handled' };
    }

    if (cmd === '/me' || cmd === '/whoami') {
      ctx.setMessage('');
      const res = await fetch('/api/auth/me');
      const j = (await res.json().catch(() => ({}))) as { email?: string };
      ctx.appendSystemMessages([sys(`Session : ${String(j.email || '(anonyme / vide)')}`)]);
      return { kind: 'handled' };
    }

    if (cmd === '/assignments' || cmd === '/tools-agent') {
      if (!ctx.agentId) {
        push('Sélectionne un agent pour /assignments.');
        return { kind: 'handled' };
      }
      ctx.setMessage('');
      const res = await fetch(`/api/agent-tool-assignments?agentId=${encodeURIComponent(ctx.agentId)}`);
      const j = await res.json().catch(() => ({}));
      if (res.status === 401) {
        ctx.appendSystemMessages([
          sys(
            'Assignations d’outils : connexion requise (401). Authentifie-toi sur le site ou utilise un jeton avec droits équivalent.',
          ),
        ]);
        return { kind: 'handled' };
      }
      if (!res.ok) {
        ctx.appendSystemMessages([
          sys(`Assignations : ${String((j as { error?: string }).error || res.status)}`),
        ]);
        return { kind: 'handled' };
      }
      type AssignRow = {
        toolId?: unknown;
        enabled?: boolean;
        tool?: { name?: string; implementationKind?: string } | null;
      };
      const items = Array.isArray((j as { items?: AssignRow[] }).items) ? (j as { items: AssignRow[] }).items : [];
      const lines = items
        .slice(0, 35)
        .map(
          (it) =>
            `• ${it.tool?.name || it.toolId} — ${it.enabled ? 'on' : 'off'} — ${it.tool?.implementationKind || ''}`,
        );
      const more = items.length > 35 ? `\n… +${items.length - 35} assignation(s).` : '';
      ctx.appendSystemMessages([
        sys(`Outils assignés à ${ctx.agentId} (${items.length}) :\n${lines.join('\n')}${more}`),
      ]);
      return { kind: 'handled' };
    }

    return { kind: 'forward' };
  } catch (e) {
    ctx.setMessage('');
    ctx.appendSystemMessages([sys(`Erreur commande ${cmd0} : ${e instanceof Error ? e.message : String(e)}`)]);
    return { kind: 'handled' };
  }
}
