// @ts-nocheck
import type { APIRoute } from 'astro';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { loadAstroDb } from '../../lib/load-astro-db';
import { FORGE_AGENT_INSTRUCTION_ROWS } from '../../lib/agent-instruction-defaults';
import {
  fetchOpenClawSessionsPayload,
  normalizeOpenClawSessions,
  mapSessionToAgentRow,
  getOpenClawGatewayBaseUrl,
  getOpenClawToken,
  getGatewayAuthHeaders,
} from '../../lib/openclaw-gateway';

const execFileAsync = promisify(execFile);

/**
 * Charge le modèle attribué à un agent depuis la DB ou les defaults statiques.
 */
async function getAgentModel(
  db: any,
  AgentInstruction: any,
  agentId: string,
): Promise<string> {
  try {
    const rows = await db
      .select({ model: AgentInstruction.model })
      .from(AgentInstruction)
      .where(AgentInstruction.agentId.eq ? AgentInstruction.agentId.eq(agentId) : undefined);
    if (rows?.[0]?.model) return String(rows[0].model);
  } catch { /* fallback */ }
  const def = FORGE_AGENT_INSTRUCTION_ROWS.find((r) => r.agentId === agentId);
  return def?.model ?? 'qwen2.5:7b';
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Base URL pour les instructions agents (POST /api/forge-hook). */
function forgeHookBaseUrl(): string {
  const u =
    process.env.FORGE_HOOK_BASE_URL?.trim() ||
    process.env.PUBLIC_FORGE_URL?.trim() ||
    process.env.PUBLIC_SITE_URL?.trim();
  if (u) return u.replace(/\/$/, '');
  return 'http://127.0.0.1:4321';
}

// ── Rôles participants à l'audit ───────────────────────────────────────────────
const AUDIT_ROLES: Array<{
  agentId: string;
  label: string;
  prompt: (projectName: string, projectPath: string) => string;
}> = [
  {
    agentId: 'CHEF_TECHNIQUE',
    label: 'Coordination & synthèse',
    prompt: (name, projPath) => {
      const base = forgeHookBaseUrl();
      const hookCmd = (type: string, title: string, content: string, extra = '') =>
        `curl -s -X POST ${base}/api/forge-hook -H "Content-Type: application/json" -d '{"agentId":"CHEF_TECHNIQUE","type":"${type}","title":"${title}","content":"${content}","project":"${name}"${extra}}'`;
      return (
        `[AUDIT FORGE] Projet : "${name}" (chemin : ${projPath || '/mnt/GitHub/' + name})\n\n` +
        `Tu es CHEF_TECHNIQUE. Tu as accès à bash et aux outils système du ZimaCube.\n\n` +
        `## RÈGLE ABSOLUE : Ne dis JAMAIS à l'utilisateur d'exécuter des commandes manuellement.\n` +
        `Tu fais le travail toi-même via bash ou via les APIs Forge ci-dessous.\n\n` +
        `## APIs Forge disponibles (réseau local) :\n\n` +
        `### Vérifier statut serveur dev :\n` +
        `${hookCmd('dev_server_control', 'Statut serveur', 'check', ',"action":"status"')}\n\n` +
        `### Démarrer le serveur dev si arrêté :\n` +
        `${hookCmd('dev_server_control', 'Start serveur', 'lancement', ',"action":"start"')}\n\n` +
        `### Reporter résultats d'audit :\n` +
        `${hookCmd('completion', `Audit ${name} terminé`, '[résumé ici]')}\n\n` +
        `## Mission :\n` +
        `1. Vérifier le statut du serveur dev (utilise l'API ci-dessus, pas de commande shell npm)\n` +
        `2. Lire le package.json et le git log dans ${projPath || '/mnt/GitHub/' + name}\n` +
        `3. Coordonner les agents ANALYSTE_CODE, SECURITE_CODE, TESTEUR_QA, DEV_BACKEND, DEV_FRONTEND\n` +
        `4. Consolider les résultats et reporter via forge-hook\n\n` +
        `Commence maintenant.`
      );
    },
  },
  {
    agentId: 'ANALYSTE_CODE',
    label: 'Qualité & dette technique',
    prompt: (name, projPath) => {
      const base = forgeHookBaseUrl();
      return (
        `[AUDIT FORGE] Projet : "${name}" (chemin : ${projPath || '/mnt/GitHub/' + name})\n\n` +
        `Tu es ANALYSTE_CODE. RÈGLE : Effectue le travail toi-même, ne demande pas à l'utilisateur d'exécuter quoi que ce soit.\n\n` +
        `Analyse la qualité du code de "${name}" :\n` +
        `- Structure des fichiers, découpage des responsabilités\n` +
        `- Complexité cyclomatique, fonctions trop longues\n` +
        `- Dette technique évidente, duplications\n` +
        `- Respect des conventions (nommage, commentaires)\n` +
        `- TODO/FIXME laissés dans le code\n\n` +
        `Reporter via :\ncurl -s -X POST ${base}/api/forge-hook -H "Content-Type: application/json" -d '{"agentId":"ANALYSTE_CODE","type":"completion","title":"Analyse code ${name}","content":"[findings]","project":"${name}"}'`
      );
    },
  },
  {
    agentId: 'SECURITE_CODE',
    label: 'Sécurité & vulnérabilités',
    prompt: (name, projPath) => {
      const base = forgeHookBaseUrl();
      return (
        `[AUDIT FORGE] Projet : "${name}" (chemin : ${projPath || '/mnt/GitHub/' + name})\n\n` +
        `Tu es SECURITE_CODE. RÈGLE : Effectue le travail toi-même, ne demande pas à l'utilisateur d'exécuter quoi que ce soit.\n\n` +
        `Audite la sécurité de "${name}" :\n` +
        `- npm audit (package.json dans ${projPath || '/mnt/GitHub/' + name})\n` +
        `- Secrets exposés (clés API, mots de passe hardcodés)\n` +
        `- En-têtes HTTP, CORS, authentification\n` +
        `- Injection, XSS, validation des entrées\n\n` +
        `Reporter via :\ncurl -s -X POST ${base}/api/forge-hook -H "Content-Type: application/json" -d '{"agentId":"SECURITE_CODE","type":"completion","title":"Audit sécurité ${name}","content":"[findings]","project":"${name}"}'`
      );
    },
  },
  {
    agentId: 'TESTEUR_QA',
    label: 'Tests & couverture',
    prompt: (name, projPath) => {
      const base = forgeHookBaseUrl();
      return (
        `[AUDIT FORGE] Projet : "${name}" (chemin : ${projPath || '/mnt/GitHub/' + name})\n\n` +
        `Tu es TESTEUR_QA. RÈGLE : Effectue le travail toi-même, ne demande pas à l'utilisateur d'exécuter quoi que ce soit.\n\n` +
        `Audite les tests de "${name}" :\n` +
        `- Présence de tests (unit, integration, e2e)\n` +
        `- Cas limites non couverts\n` +
        `- Qualité des assertions et mocks\n` +
        `- Scripts de test disponibles\n\n` +
        `Reporter via :\ncurl -s -X POST ${base}/api/forge-hook -H "Content-Type: application/json" -d '{"agentId":"TESTEUR_QA","type":"completion","title":"Audit tests ${name}","content":"[findings]","project":"${name}"}'`
      );
    },
  },
  {
    agentId: 'DEV_BACKEND',
    label: 'APIs & performance backend',
    prompt: (name, projPath) => {
      const base = forgeHookBaseUrl();
      return (
        `[AUDIT FORGE] Projet : "${name}" (chemin : ${projPath || '/mnt/GitHub/' + name})\n\n` +
        `Tu es DEV_BACKEND. RÈGLE : Effectue le travail toi-même, ne demande pas à l'utilisateur d'exécuter quoi que ce soit.\n\n` +
        `Audite le backend de "${name}" :\n` +
        `- Architecture des routes / endpoints\n` +
        `- Gestion des erreurs et codes HTTP\n` +
        `- Performance (requêtes N+1, index DB, mémoire)\n` +
        `- Typage TypeScript côté serveur\n\n` +
        `Reporter via :\ncurl -s -X POST ${base}/api/forge-hook -H "Content-Type: application/json" -d '{"agentId":"DEV_BACKEND","type":"completion","title":"Audit backend ${name}","content":"[findings]","project":"${name}"}'`
      );
    },
  },
  {
    agentId: 'DEV_FRONTEND',
    label: 'Frontend, UX & accessibilité',
    prompt: (name, projPath) => {
      const base = forgeHookBaseUrl();
      return (
        `[AUDIT FORGE] Projet : "${name}" (chemin : ${projPath || '/mnt/GitHub/' + name})\n\n` +
        `Tu es DEV_FRONTEND. RÈGLE : Effectue le travail toi-même, ne demande pas à l'utilisateur d'exécuter quoi que ce soit.\n\n` +
        `Audite le frontend de "${name}" :\n` +
        `- Accessibilité a11y (aria, contrastes, navigation clavier)\n` +
        `- Performance (LCP, CLS, bundle size, lazy loading)\n` +
        `- Responsive design (mobile/tablet)\n` +
        `- UX : messages d'erreur, loading states\n\n` +
        `Reporter via :\ncurl -s -X POST ${base}/api/forge-hook -H "Content-Type: application/json" -d '{"agentId":"DEV_FRONTEND","type":"completion","title":"Audit frontend ${name}","content":"[findings]","project":"${name}"}'`
      );
    },
  },
];

// ── Matching session OpenClaw ↔ agentId (simplifié vs agents.ts) ──────────────
function normKey(s: string): string {
  return String(s).trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function sessionMatchScore(raw: Record<string, unknown>, agentId: string): number {
  const want = normKey(agentId);
  const same = (v: unknown) => normKey(String(v ?? '')) === want;
  if (same(raw.agentId) || same(raw.agent_id)) return 100;
  if (same(raw.displayName) || same(raw.display_name)) return 90;
  if (same(raw.label)) return 88;
  const keyStr = String(raw.key ?? raw.sessionKey ?? raw.session_key ?? '');
  if (keyStr) {
    const parts = keyStr.split(/[:\\/]+/).map((p) => normKey(p)).filter(Boolean);
    if (parts.includes(want)) return 70;
  }
  const mapped = mapSessionToAgentRow(raw);
  if (normKey(String(mapped.name)) === want) return 60;
  return 0;
}

function findSessionKey(rawSessions: Record<string, unknown>[], agentId: string): string | null {
  let best: { key: string; score: number; ms: number } | null = null;
  for (const raw of rawSessions) {
    const score = sessionMatchScore(raw, agentId);
    if (score === 0) continue;
    const mapped = mapSessionToAgentRow(raw);
    const ms = Number(mapped.lastSeenMs) || 0;
    if (!best || score > best.score || (score === best.score && ms > best.ms)) {
      best = { key: mapped.id, score, ms };
    }
  }
  return best ? best.key : null;
}

/**
 * Si aucune session ne correspond à l'agent, retourne la clé de la session
 * la plus récente disponible (ex. session Telegram principale).
 */
function getDefaultSessionKey(rawSessions: Record<string, unknown>[]): string | null {
  if (!rawSessions.length) return null;
  // Trier par lastSeenMs décroissant (session la plus récente en premier)
  const sorted = [...rawSessions].sort((a, b) => {
    const ma = mapSessionToAgentRow(a);
    const mb = mapSessionToAgentRow(b);
    return (Number(mb.lastSeenMs) || 0) - (Number(ma.lastSeenMs) || 0);
  });
  const mapped = mapSessionToAgentRow(sorted[0]);
  return mapped.id || null;
}

// ── Envoi directive vers session OpenClaw (HTTP sessions_send) ────────────────
async function sendDirectiveHttp(
  sessionKey: string,
  message: string,
): Promise<{ ok: boolean; error?: string }> {
  const token = await getOpenClawToken();
  if (!token) return { ok: false, error: 'Token OpenClaw manquant' };
  const base = await getOpenClawGatewayBaseUrl();
  try {
    const res = await fetch(`${base}/tools/invoke`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...getGatewayAuthHeaders(token),
      },
      body: JSON.stringify({
        tool: 'sessions_send',
        action: 'json',
        // timeoutSeconds: 30 pour laisser le temps à une session en veille de se réveiller.
        // On n'attend pas la réponse complète (async), juste la confirmation d'envoi.
        args: { sessionKey, message, timeoutSeconds: 30, async: true },
        sessionKey,
        dryRun: false,
      }),
    });
    const txt = await res.text().catch(() => '');
    let data: Record<string, unknown> = {};
    try { data = txt ? JSON.parse(txt) : {}; } catch { data = { raw: txt }; }

    if (!res.ok) {
      const errMsg = (typeof data.error === 'string' ? data.error : null)
        || (data.message as string | undefined)
        || `Gateway ${res.status}`;
      return { ok: false, error: `${errMsg}${txt && txt.length < 300 ? ' — ' + txt : ''}` };
    }
    // Certaines gateway renvoient HTTP 200 mais avec ok:false dans le body
    if (data.ok === false) {
      const errMsg = (typeof data.error === 'string' ? data.error : null)
        || (data.message as string | undefined)
        || 'sessions_send refusé par gateway';
      return { ok: false, error: errMsg };
    }
    return { ok: true };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur réseau' };
  }
}

/**
 * Tente `openclaw task` directement si le CLI est installé sur l'hôte.
 */
async function invokeViaHostCli(
  agentId: string,
  message: string,
): Promise<{ ok: boolean; method: string; error?: string }> {
  try {
    await execFileAsync('openclaw', ['task', '--agent', agentId, '--input', message], {
      timeout: 15_000,
    });
    return { ok: true, method: 'host-cli' };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, method: 'host-cli', error: msg.slice(0, 300) };
  }
}

/**
 * Tente via la gateway HTTP : tool `agents_invoke` (crée session + envoie).
 * Certaines versions du gateway exposent cet outil.
 */
async function invokeViaGatewayAgentsInvoke(
  agentId: string,
  message: string,
): Promise<{ ok: boolean; method: string; error?: string }> {
  const token = await getOpenClawToken();
  if (!token) return { ok: false, method: 'gateway-invoke', error: 'Token manquant' };
  const base = await getOpenClawGatewayBaseUrl();
  try {
    const res = await fetch(`${base}/tools/invoke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getGatewayAuthHeaders(token) },
      body: JSON.stringify({
        tool: 'agents_invoke',
        action: 'json',
        args: { agentId, input: message, async: true },
      }),
    });
    const txt = await res.text().catch(() => '');
    if (res.ok) return { ok: true, method: 'gateway-invoke' };
    return { ok: false, method: 'gateway-invoke', error: `HTTP ${res.status}: ${txt.slice(0, 200)}` };
  } catch (e: unknown) {
    return { ok: false, method: 'gateway-invoke', error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Dispatch via POST /v1/chat/completions (surface OpenAI du gateway).
 * Utilise model: `openclaw/<agentId>` pour router vers le bon agent/modèle.
 * La requête est fire-and-forget (maxTokens=1 pour minimiser le temps de blocage).
 */
async function invokeViaV1ChatCompletions(
  agentId: string,
  backendModel: string,
  message: string,
): Promise<{ ok: boolean; method: string; error?: string }> {
  const token = await getOpenClawToken();
  if (!token) return { ok: false, method: 'v1-chat', error: 'Token manquant' };
  const base = await getOpenClawGatewayBaseUrl();
  const openAiModel = `openclaw/${agentId}`;
  try {
    const res = await fetch(`${base}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...getGatewayAuthHeaders(token),
        // Header propriétaire OpenClaw pour forcer le modèle backend
        ...(backendModel ? { 'x-openclaw-model': backendModel } : {}),
      },
      body: JSON.stringify({
        model: openAiModel,
        // max_tokens réduit → on veut juste déclencher l'agent, pas attendre la réponse complète
        max_tokens: 1,
        stream: false,
        messages: [{ role: 'user', content: message }],
      }),
    });
    const txt = await res.text().catch(() => '');
    let data: Record<string, unknown> = {};
    try { data = txt ? JSON.parse(txt) : {}; } catch { data = { raw: txt }; }
    if (!res.ok) {
      const errMsg = (typeof (data.error as any)?.message === 'string' ? (data.error as any).message : null)
        || (typeof data.error === 'string' ? data.error : null)
        || `HTTP ${res.status}`;
      return { ok: false, method: 'v1-chat', error: `${errMsg} (model: ${openAiModel})` };
    }
    return { ok: true, method: `v1-chat(${openAiModel}→${backendModel || 'auto'})` };
  } catch (e: unknown) {
    return { ok: false, method: 'v1-chat', error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Invoque un agent via `docker exec <container> openclaw task`.
 * Essaie plusieurs noms de container courants.
 */
async function invokeViaDockerExec(
  agentId: string,
  message: string,
): Promise<{ ok: boolean; method: string; error?: string }> {
  // Trouver le vrai nom du container openclaw
  let containerName = 'openclaw';
  try {
    const { stdout } = await execFileAsync('docker', ['ps', '--filter', 'name=openclaw', '--format', '{{.Names}}'], { timeout: 5_000 });
    const found = stdout.trim().split('\n').find((n) => n.trim());
    if (found) containerName = found.trim();
  } catch { /* utiliser le nom par défaut */ }

  try {
    await execFileAsync(
      'docker',
      ['exec', containerName, 'openclaw', 'task', '--agent', agentId, '--input', message],
      { timeout: 20_000 },
    );
    return { ok: true, method: `docker-exec(${containerName})` };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, method: `docker-exec(${containerName})`, error: msg.slice(0, 400) };
  }
}

// ── Endpoint principal ────────────────────────────────────────────────────────
export const POST: APIRoute = async ({ request, locals }) => {
  const email = locals.user?.email as string | undefined;

  let body: { projectName?: string; projectId?: number; projectPath?: string; roles?: string[] };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Corps JSON invalide' }, 400);
  }

  const projectName = String(body.projectName ?? '').trim();
  if (!projectName) return json({ error: 'projectName requis' }, 400);

  const projectPath = String(body.projectPath ?? '').trim();
  const selectedRoles = Array.isArray(body.roles) && body.roles.length > 0
    ? body.roles
    : AUDIT_ROLES.map((r) => r.agentId);

  const roles = AUDIT_ROLES.filter((r) => selectedRoles.includes(r.agentId));
  if (!roles.length) return json({ error: 'Aucun rôle valide sélectionné' }, 400);

  // Récupérer sessions OpenClaw
  const sessionsResult = await fetchOpenClawSessionsPayload(email, {
    invokeOnly: true,
    sessionsListArgs: { limit: 50 },
  });
  const rawSessions = sessionsResult.ok
    ? (normalizeOpenClawSessions(sessionsResult.data) as Record<string, unknown>[])
    : [];

  const now = new Date();
  const { db, AgentTask, AgentMessage, AgentInstruction, eq } = await loadAstroDb();

  // Charger les modèles par agent depuis la DB (fallback sur les defaults statiques)
  let instructionModels: Record<string, string> = {};
  try {
    const instRows = await db.select({ agentId: AgentInstruction.agentId, model: AgentInstruction.model }).from(AgentInstruction);
    for (const r of instRows) {
      if (r.agentId && r.model) instructionModels[r.agentId] = r.model;
    }
  } catch { /* utilise les defaults */ }
  // Compléter avec les defaults statiques pour les agents sans entrée DB
  for (const def of FORGE_AGENT_INSTRUCTION_ROWS) {
    if (!instructionModels[def.agentId] && def.model) {
      instructionModels[def.agentId] = def.model;
    }
  }

  const results: Array<{
    agentId: string;
    label: string;
    sessionKey: string | null;
    usedFallbackSession: boolean;
    dispatched: boolean;
    queued: boolean;
    method?: string;
    attempts?: string[];
    error?: string;
  }> = [];

  // Session de fallback : si aucune session ne porte le nom d'un rôle (ex. session Telegram),
  // on envoie quand même au canal principal disponible.
  const defaultSessionKey = getDefaultSessionKey(rawSessions);

  const hookBase = forgeHookBaseUrl();

  for (const role of roles) {
    const prompt = role.prompt(projectName, projectPath);
    const specificKey = findSessionKey(rawSessions, role.agentId);
    const sessionKey = specificKey ?? defaultSessionKey;
    const usedFallback = !specificKey && !!defaultSessionKey;
    const agentModel = instructionModels[role.agentId] ?? 'qwen2.5:7b';

    let taskDbId: number | undefined;
    // Toujours créer une AgentTask pour le suivi (id nécessaire pour clôturer via forge-hook)
    try {
      const [inserted] = await db
        .insert(AgentTask)
        .values({
          agentId: role.agentId,
          task: `[AUDIT] ${role.label} — ${projectName}`,
          input: prompt,
          status: 'pending',
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      taskDbId = inserted?.id;
    } catch {
      /* doublon ou DB indisponible */
    }

    const completionBlock =
      taskDbId != null
        ? `\n\n---\n**Forge — journal de mission** · taskId numérique = **${taskDbId}** (obligatoire pour passer la ligne de « pending » à « completed »).\nQuand cette mission est terminée, appelle :\nPOST ${hookBase}/api/forge-hook\nContent-Type: application/json\nCorps JSON (exemple, adapte title/content) :\n{"agentId":"${role.agentId}","type":"completion","taskId":${taskDbId},"title":"Audit ${projectName} — ${role.label}","content":"Résumé de ce que tu as fait","project":"${projectName}"}\n(La requête doit provenir d'une IP autorisée par forge-hook.)\n`
        : '';

    const promptToSend = `${prompt}${completionBlock}`;

    // Toujours notifier via AgentMessage
    try {
      await db.insert(AgentMessage).values({
        fromAgent: 'FORGE',
        toAgent: role.agentId,
        content: `[AUDIT ${projectName}] ${role.label} — taskId=${taskDbId ?? '?'} — ${promptToSend.slice(0, 280)}`,
        timestamp: now,
      });
    } catch {
      /* ignore */
    }

    // ── 1. POST /v1/chat/completions avec modèle attribué (méthode principale) ─
    let dispatched = false;
    let dispatchMethod = '';
    const attempts: string[] = [];

    {
      const r = await invokeViaV1ChatCompletions(role.agentId, agentModel, promptToSend);
      attempts.push(`v1-chat(${agentModel}): ${r.ok ? 'OK' : r.error}`);
      if (r.ok) { dispatched = true; dispatchMethod = r.method; }
    }

    // ── 2. HTTP sessions_send (session existante / fallback Telegram) ──────
    if (!dispatched && sessionKey) {
      const r = await sendDirectiveHttp(sessionKey, promptToSend);
      attempts.push(`sessions_send(${sessionKey}): ${r.ok ? 'OK' : r.error}`);
      if (r.ok) { dispatched = true; dispatchMethod = usedFallback ? `openclaw-fallback(${sessionKey})` : 'openclaw-session'; }
    }

    // ── 3. Gateway agents_invoke (nouvelle session) ────────────────────────
    if (!dispatched) {
      const r = await invokeViaGatewayAgentsInvoke(role.agentId, promptToSend);
      attempts.push(`agents_invoke: ${r.ok ? 'OK' : r.error}`);
      if (r.ok) { dispatched = true; dispatchMethod = r.method; }
    }

    // ── 4. Host CLI openclaw task ──────────────────────────────────────────
    if (!dispatched) {
      const r = await invokeViaHostCli(role.agentId, promptToSend);
      attempts.push(`host-cli: ${r.ok ? 'OK' : r.error}`);
      if (r.ok) { dispatched = true; dispatchMethod = r.method; }
    }

    // ── 5. Docker exec ─────────────────────────────────────────────────────
    if (!dispatched) {
      const r = await invokeViaDockerExec(role.agentId, promptToSend);
      attempts.push(`docker-exec: ${r.ok ? 'OK' : r.error}`);
      if (r.ok) { dispatched = true; dispatchMethod = r.method; }
    }

    results.push({
      agentId: role.agentId,
      label: role.label,
      model: agentModel,
      sessionKey,
      usedFallbackSession: usedFallback,
      dispatched,
      queued: !dispatched,
      method: dispatchMethod,
      attempts,
    });
  }

  const dispatchedCount = results.filter((r) => r.dispatched).length;
  const queuedCount = results.filter((r) => r.queued).length;

  return json({
    ok: true,
    projectName,
    dispatchedCount,
    queuedCount,
    total: results.length,
    results,
    note:
      dispatchedCount > 0
        ? `${dispatchedCount} agent(s) notifié(s) via OpenClaw. ${queuedCount > 0 ? `${queuedCount} en file d'attente DB (session inactive).` : ''}`
        : `Aucune session OpenClaw active trouvée. ${queuedCount} tâche(s) enregistrée(s) en DB — les agents les traiteront à leur prochaine connexion.`,
  });
};

export const GET: APIRoute = async () => {
  return json({
    roles: AUDIT_ROLES.map((r) => ({ agentId: r.agentId, label: r.label })),
  });
};
