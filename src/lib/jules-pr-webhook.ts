/**
 * Webhook GitHub : PR ouvertes par Jules (Google Labs) → tâches Forge + notification OpenClaw.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { loadAstroDb } from './load-astro-db';
import { invokeOpenClawSessionsSend, resolveSessionsSendKey } from './openclaw-gateway';

export function verifyGithubSignature256(
  secret: string,
  rawBody: string,
  signatureHeader: string | null,
): boolean {
  if (!signatureHeader || !signatureHeader.startsWith('sha256=')) return false;
  const expectedHex = signatureHeader.slice(7);
  let sig: Buffer;
  try {
    sig = Buffer.from(expectedHex, 'hex');
  } catch {
    return false;
  }
  const hmac = createHmac('sha256', secret).update(rawBody, 'utf8').digest();
  if (sig.length !== hmac.length) return false;
  return timingSafeEqual(sig, hmac);
}

const DEFAULT_JULES_LOGINS = ['google-labs-jules[bot]', 'google-labs-jules'];

function julesLoginSet(): Set<string> {
  const s = new Set(DEFAULT_JULES_LOGINS.map((x) => x.toLowerCase()));
  const extra = process.env.JULES_GITHUB_LOGINS?.trim();
  if (extra) {
    for (const p of extra.split(',')) {
      const t = p.trim().toLowerCase();
      if (t) s.add(t);
    }
  }
  return s;
}

export function isJulesPullRequestAuthor(login: string | undefined): boolean {
  if (!login) return false;
  return julesLoginSet().has(login.trim().toLowerCase());
}

function forgeHookBaseUrl(): string {
  const u =
    process.env.FORGE_HOOK_BASE_URL?.trim() ||
    process.env.PUBLIC_FORGE_URL?.trim() ||
    process.env.PUBLIC_SITE_URL?.trim();
  if (u) return u.replace(/\/$/, '');
  return 'http://127.0.0.1:4321';
}

const PR_ACTIONS = new Set(['opened', 'reopened', 'ready_for_review']);

type RoleDef = {
  agentId: string;
  label: string;
  buildPrompt: (ctx: JulesPrContext) => string;
};

export type JulesPrContext = {
  projectName: string;
  projectPath: string;
  repoFullName: string;
  prNumber: number;
  prTitle: string;
  prUrl: string;
  headRef: string;
  baseRef: string;
};

const JULES_ROLES: RoleDef[] = [
  {
    agentId: 'ANALYSTE_CODE',
    label: 'Recommandations & revue',
    buildPrompt: (c) =>
      `[PR JULES — ${c.repoFullName}#${c.prNumber}] Tu es ANALYSTE_CODE.\n\n` +
      `Une PR ouverte par **Jules** (Google Labs) cible la branche \`${c.baseRef}\` depuis \`${c.headRef}\`.\n` +
      `Lien : ${c.prUrl}\nTitre : ${c.prTitle}\n\n` +
      `Mission :\n` +
      `1) Examiner les changements (diff GitHub, fichiers touchés, risques).\n` +
      `2) Lister les **recommandations** concrètes (qualité, dette, lisibilité, perf).\n` +
      `3) Signaler tout problème bloquant.\n\n` +
      `Projet Forge : **${c.projectName}** (chemin local indicatif : \`${c.projectPath}\`).\n` +
      `Quand terminé, clôture le journal Forge avec POST /api/forge-hook (type completion + taskId, voir bloc final).`,
  },
  {
    agentId: 'TESTEUR_QA',
    label: 'Tests & validation',
    buildPrompt: (c) =>
      `[PR JULES — ${c.repoFullName}#${c.prNumber}] Tu es TESTEUR_QA.\n\n` +
      `PR Jules : ${c.prUrl} (\`${c.headRef}\` → \`${c.baseRef}\`).\n` +
      `Projet : **${c.projectName}** (\`${c.projectPath}\`).\n\n` +
      `Mission :\n` +
      `1) Identifier les zones à risque pour les tests (régressions, cas limites).\n` +
      `2) Proposer ou exécuter les vérifications pertinentes (scripts, lint, tests auto si disponibles).\n` +
      `3) Synthèse QA pour merge.\n\n` +
      `Clôturer via forge-hook avec le taskId fourni en fin de message.`,
  },
  {
    agentId: 'EXPERT_GITHUB',
    label: 'Correctifs & Git',
    buildPrompt: (c) =>
      `[PR JULES — ${c.repoFullName}#${c.prNumber}] Tu es EXPERT_GITHUB.\n\n` +
      `PR : ${c.prUrl}\nBranche : \`${c.headRef}\` → \`${c.baseRef}\`\n` +
      `Projet : **${c.projectName}** (\`${c.projectPath}\`).\n\n` +
      `Mission :\n` +
      `1) **Corrections** : travailler sur la branche de la PR, appliquer les correctifs cohérents avec la revue (commits propres).\n` +
      `2) Respecter la gouvernance Forge (pas de push direct sur main ; PR / validation CHEF si requis).\n` +
      `3) Mettre à jour la PR ou décrire les prochaines étapes.\n\n` +
      `Clôturer via forge-hook avec le taskId fourni en fin de message.`,
  },
];

function matchProject(repoName: string, rows: { name: string; path: string }[]) {
  const rn = repoName.trim().toLowerCase();
  for (const p of rows) {
    if (p.name.trim().toLowerCase() === rn) return p;
    const pathLow = p.path.trim().toLowerCase();
    if (pathLow.endsWith(rn) || pathLow.endsWith(`/${rn}`) || pathLow.includes(`/${rn}/`)) return p;
  }
  return null;
}

async function resolveNotifySession(agentId: string): Promise<string | null> {
  const fixed = process.env.JULES_OPENCLAW_SESSION_KEY?.trim();
  if (fixed) return fixed;

  const hints = [
    'agent:main:main',
    'session:agent:main:main',
    agentId,
    agentId.toLowerCase(),
    'CHEF_TECHNIQUE',
  ];
  for (const h of hints) {
    const k = await resolveSessionsSendKey(undefined, [h]);
    if (k) return k;
  }
  return resolveSessionsSendKey(undefined, ['agent:main:main']);
}

export async function handleGithubJulesPullRequest(
  payload: unknown,
): Promise<{ ok: boolean; ignored?: string; login?: string; detail?: Record<string, unknown> }> {
  if (payload == null || typeof payload !== 'object' || Array.isArray(payload)) {
    return { ok: true, ignored: 'invalid_payload' };
  }
  const o = payload as Record<string, unknown>;

  const action = String(o.action || '');
  if (!PR_ACTIONS.has(action)) {
    return { ok: true, ignored: `action:${action || 'missing'}` };
  }

  const pr = o.pull_request as Record<string, unknown> | undefined;
  const repo = o.repository as Record<string, unknown> | undefined;
  if (!pr || !repo) return { ok: true, ignored: 'missing_pr_or_repo' };

  const user = pr.user as Record<string, unknown> | undefined;
  const login = user?.login != null ? String(user.login) : '';
  if (!isJulesPullRequestAuthor(login)) {
    return { ok: true, ignored: 'not_jules', login };
  }

  const repoName = String(repo.name || '').trim();
  if (!repoName) return { ok: true, ignored: 'no_repo_name' };

  const { db, AgentTask, AgentMessage, Project } = await loadAstroDb();
  const projects = await db.select().from(Project);
  const project = matchProject(
    repoName,
    projects.map((r) => ({ name: r.name, path: r.path })),
  );
  if (!project) {
    return { ok: true, ignored: 'no_project_match', detail: { repo: repoName } };
  }

  const prNumber = Number(pr.number);
  if (!Number.isFinite(prNumber)) return { ok: true, ignored: 'bad_pr_number' };

  const head = pr.head as Record<string, unknown> | undefined;
  const base = pr.base as Record<string, unknown> | undefined;
  const ctx: JulesPrContext = {
    projectName: project.name,
    projectPath: project.path,
    repoFullName: String(repo.full_name || repoName),
    prNumber,
    prTitle: String(pr.title || ''),
    prUrl: String(pr.html_url || ''),
    headRef: String(head?.ref || ''),
    baseRef: String(base?.ref || ''),
  };

  const hookBase = forgeHookBaseUrl();
  const now = new Date();
  const results: Array<{ agentId: string; taskId?: number; openclaw: string }> = [];

  for (const role of JULES_ROLES) {
    const basePrompt = role.buildPrompt(ctx);
    let taskDbId: number | undefined;
    try {
      const [inserted] = await db
        .insert(AgentTask)
        .values({
          agentId: role.agentId,
          task: `[PR Jules] ${role.label} — ${ctx.repoFullName}#${ctx.prNumber}`,
          input: basePrompt,
          status: 'pending',
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      taskDbId = inserted?.id;
    } catch {
      /* DB erreur : continuer avec les autres rôles */
    }

    const completionBlock =
      taskDbId != null
        ? `\n\n---\n**Forge — clôture** · taskId = **${taskDbId}** (obligatoire).\nPOST ${hookBase}/api/forge-hook\nContent-Type: application/json\n{"agentId":"${role.agentId}","type":"completion","taskId":${taskDbId},"title":"PR Jules ${ctx.repoFullName}#${ctx.prNumber} — ${role.label}","content":"Résumé de ce que tu as fait","project":"${ctx.projectName}"}\n`
        : '';

    const promptToSend = `${basePrompt}${completionBlock}`;

    try {
      await db.insert(AgentMessage).values({
        fromAgent: 'FORGE',
        toAgent: role.agentId,
        content: `[PR Jules ${ctx.repoFullName}#${ctx.prNumber}] ${role.label} — taskId=${taskDbId ?? '?'}`,
        timestamp: now,
      });
    } catch {
      /* ignore */
    }

    let openclawStatus = 'skipped';
    const sessionKey = await resolveNotifySession(role.agentId);
    if (sessionKey) {
      const send = await invokeOpenClawSessionsSend({
        sessionKey,
        message: promptToSend,
        asyncDelivery: true,
      });
      openclawStatus = send.ok ? 'sent' : (send.error || 'fail').slice(0, 200);
    } else {
      openclawStatus = 'no_session';
    }

    results.push({ agentId: role.agentId, taskId: taskDbId, openclaw: openclawStatus });
  }

  return {
    ok: true,
    detail: {
      project: ctx.projectName,
      repoFullName: ctx.repoFullName,
      pr: ctx.prNumber,
      action,
      results,
    },
  };
}
