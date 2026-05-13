/**
 * Moteur de permissions Forge — décide allow / deny / ask pour
 * un couple (agent, outil, arguments).
 *
 * Inspiré de :
 *  - `useCanUseTool` (claude-code) — pipeline modes + classifier
 *  - `inherited-tool-deny.ts` (openclaw) — allow/deny normalisés
 *
 * Stockage :
 *  - Mode global + listes globales dans `Config` (clés `permissionMode`,
 *    `permissionAllowedTools`, `permissionDeniedTools`).
 *  - Override par agent dans table `AgentPermission`.
 *  - **DENY_PATTERNS** : non négociable, codé en dur.
 */
import { eq } from 'drizzle-orm';
import { getConfig } from './config-db';
import { loadAstroDb } from './load-astro-db';

export type PermissionMode = 'autonomous' | 'tiered' | 'plan_first';
export type PermissionDecision = 'allow' | 'deny' | 'ask';

export type PermissionDecisionContext = {
  agentId: string;
  toolName: string;
  args?: Record<string, unknown>;
  /** Vrai si l'outil est explicitement destructif (delete, force push, drop, etc.). */
  isDestructive?: boolean;
  /** Vrai si l'outil n'a aucun effet de bord (read_file, list, …). */
  isReadOnly?: boolean;
};

export type PermissionDecisionResult = {
  decision: PermissionDecision;
  reason: string;
  /** Identifiant de la règle qui a tranché (utile pour audit). */
  ruleId: string;
};

/**
 * Patterns dangereux **jamais autorisés**, quel que soit le mode.
 * Note : la chaîne est testée contre une concaténation outil + args sérialisés
 * (mode case-insensitive). Pour bloquer un cas spécifique, ajouter un pattern
 * regex ciblé.
 */
const HARD_DENY_PATTERNS: Array<{ id: string; pattern: RegExp; reason: string }> = [
  { id: 'rmrf-root', pattern: /rm\s+-rf?\s+\/(?![\w])/i, reason: 'Suppression récursive de la racine système.' },
  { id: 'rmrf-home', pattern: /rm\s+-rf?\s+(\$HOME|~|\/home\/?$|\/Users\/?$)/i, reason: 'Suppression récursive du home.' },
  { id: 'push-force-main', pattern: /git\s+push\s+(-{1,2}force\b|\-f\b)[^\n]*\b(main|master)\b/i, reason: 'Push force sur la branche principale.' },
  { id: 'dd-of-dev', pattern: /\bdd\b[^\n]*\bof\s*=\s*\/dev\//i, reason: 'Écriture brute sur un device.' },
  { id: 'mkfs', pattern: /\bmkfs\.(ext|xfs|btrfs|vfat|ntfs)/i, reason: 'Reformatage de filesystem.' },
  { id: 'chmod-777-root', pattern: /chmod\s+-R\s+777\s+\/(?![\w])/i, reason: 'Permissions ouvertes sur la racine.' },
  { id: 'curl-pipe-sh', pattern: /(curl|wget)[^\n]*\|\s*(sudo\s+)?(sh|bash|zsh)\b/i, reason: 'Pipe shell d\'un téléchargement.' },
  { id: 'shutdown', pattern: /\b(shutdown|reboot|halt|poweroff)\b\s*(-\w+)?\s*(now|0)?/i, reason: 'Arrêt système.' },
  { id: 'fork-bomb', pattern: /:\(\)\s*\{\s*:\|:&\s*\};:/, reason: 'Fork bomb.' },
];

type CacheEntry = {
  mode: PermissionMode;
  allowedTools: Set<string>;
  deniedTools: Set<string>;
  perAgent: Map<string, AgentPermissionRow>;
  fetchedAt: number;
};

type AgentPermissionRow = {
  agentId: string;
  mode?: PermissionMode | null;
  allowedTools: Set<string>;
  deniedTools: Set<string>;
};

let _cache: CacheEntry | null = null;
const CACHE_TTL_MS = 5_000;

function parseToolList(raw: string): Set<string> {
  if (!raw) return new Set();
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return new Set(parsed.map((v) => String(v).trim()).filter(Boolean));
    }
  } catch {
    /* fall through */
  }
  return new Set(
    raw
      .split(/[\n,;]/)
      .map((v) => v.trim())
      .filter(Boolean),
  );
}

function normalizeMode(raw: string): PermissionMode {
  const v = String(raw || '').trim().toLowerCase();
  if (v === 'tiered' || v === 'plan_first' || v === 'autonomous') return v;
  return 'autonomous';
}

async function loadCache(force = false): Promise<CacheEntry> {
  if (!force && _cache && Date.now() - _cache.fetchedAt < CACHE_TTL_MS) return _cache;
  const mode = normalizeMode(await getConfig('permissionMode'));
  const allowedTools = parseToolList(await getConfig('permissionAllowedTools'));
  const deniedTools = parseToolList(await getConfig('permissionDeniedTools'));

  const perAgent = new Map<string, AgentPermissionRow>();
  try {
    const { db, AgentPermission } = await loadAstroDb();
    if (AgentPermission) {
      const rows = await db.select().from(AgentPermission);
      for (const row of rows) {
        perAgent.set(row.agentId, {
          agentId: row.agentId,
          mode: row.mode ? normalizeMode(row.mode) : null,
          allowedTools: parseToolList(row.allowedTools || ''),
          deniedTools: parseToolList(row.deniedTools || ''),
        });
      }
    }
  } catch {
    /* DB indisponible ou table pas encore migrée */
  }

  _cache = { mode, allowedTools, deniedTools, perAgent, fetchedAt: Date.now() };
  return _cache;
}

export function resetPermissionEngineCache(): void {
  _cache = null;
}

function matchHardDeny(toolName: string, args?: Record<string, unknown>): { id: string; reason: string } | null {
  const haystack = `${toolName} ${JSON.stringify(args ?? {})}`;
  for (const rule of HARD_DENY_PATTERNS) {
    if (rule.pattern.test(haystack)) return { id: rule.id, reason: rule.reason };
  }
  return null;
}

export async function decidePermission(
  ctx: PermissionDecisionContext,
): Promise<PermissionDecisionResult> {
  const cache = await loadCache();
  const agentOverride = cache.perAgent.get(ctx.agentId);

  // 1. Hard deny — non négociable
  const hard = matchHardDeny(ctx.toolName, ctx.args);
  if (hard) {
    return { decision: 'deny', reason: hard.reason, ruleId: `hard_deny:${hard.id}` };
  }

  // 2. Override agent — deny prioritaire sur allow
  if (agentOverride) {
    if (agentOverride.deniedTools.has(ctx.toolName)) {
      return {
        decision: 'deny',
        reason: `Outil refusé pour l'agent ${ctx.agentId}.`,
        ruleId: 'agent_override:deny',
      };
    }
    if (agentOverride.allowedTools.has(ctx.toolName)) {
      return {
        decision: 'allow',
        reason: `Outil explicitement autorisé pour l'agent ${ctx.agentId}.`,
        ruleId: 'agent_override:allow',
      };
    }
  }

  // 3. Listes globales
  if (cache.deniedTools.has(ctx.toolName)) {
    return { decision: 'deny', reason: 'Outil refusé globalement.', ruleId: 'global:deny' };
  }
  if (cache.allowedTools.has(ctx.toolName)) {
    return { decision: 'allow', reason: 'Outil explicitement autorisé globalement.', ruleId: 'global:allow' };
  }

  // 4. Modes — global, ou override agent si présent
  const effectiveMode: PermissionMode = agentOverride?.mode || cache.mode;
  switch (effectiveMode) {
    case 'autonomous':
      return { decision: 'allow', reason: 'Mode autonome — accès total.', ruleId: 'mode:autonomous' };
    case 'tiered':
      if (ctx.isReadOnly) {
        return { decision: 'allow', reason: 'Outil lecture seule.', ruleId: 'mode:tiered:read' };
      }
      if (ctx.isDestructive) {
        return {
          decision: 'ask',
          reason: 'Outil destructif — approbation requise (mode tiered).',
          ruleId: 'mode:tiered:destructive',
        };
      }
      return { decision: 'allow', reason: 'Outil neutre (mode tiered).', ruleId: 'mode:tiered:neutral' };
    case 'plan_first':
      return {
        decision: 'ask',
        reason: 'Mode plan-first — chaque outil demande validation.',
        ruleId: 'mode:plan_first',
      };
  }
}

/**
 * Enregistre la décision dans le journal d'audit (best-effort).
 */
export async function recordPermissionDecision(
  ctx: PermissionDecisionContext,
  result: PermissionDecisionResult,
): Promise<void> {
  if (result.decision === 'allow' && result.ruleId.startsWith('mode:autonomous')) {
    // Pas d'audit en mode autonome trivial (sinon ActivityLog explose).
    return;
  }
  try {
    const { db, ActivityLog } = await loadAstroDb();
    await db.insert(ActivityLog).values({
      actorType: 'system',
      actorId: 'permission_engine',
      action: `permission.${result.decision}`,
      entityType: 'tool',
      entityId: ctx.toolName,
      details: JSON.stringify({
        agentId: ctx.agentId,
        ruleId: result.ruleId,
        reason: result.reason,
        isDestructive: Boolean(ctx.isDestructive),
        isReadOnly: Boolean(ctx.isReadOnly),
      }),
      createdAt: new Date(),
    });
  } catch {
    /* ignore audit failures */
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Helpers de configuration (utilisés par routes API)
// ───────────────────────────────────────────────────────────────────────────

export async function getGlobalPermissionConfig(): Promise<{
  mode: PermissionMode;
  allowedTools: string[];
  deniedTools: string[];
}> {
  const cache = await loadCache(true);
  return {
    mode: cache.mode,
    allowedTools: [...cache.allowedTools],
    deniedTools: [...cache.deniedTools],
  };
}

export async function getAgentPermission(agentId: string): Promise<{
  agentId: string;
  mode: PermissionMode | null;
  allowedTools: string[];
  deniedTools: string[];
}> {
  const cache = await loadCache(true);
  const row = cache.perAgent.get(agentId);
  return {
    agentId,
    mode: row?.mode ?? null,
    allowedTools: row ? [...row.allowedTools] : [],
    deniedTools: row ? [...row.deniedTools] : [],
  };
}

export async function setAgentPermission(params: {
  agentId: string;
  mode?: PermissionMode | null;
  allowedTools?: string[];
  deniedTools?: string[];
}): Promise<void> {
  const { db, AgentPermission } = await loadAstroDb();
  if (!AgentPermission) return;
  const now = new Date();
  const allowed = JSON.stringify(params.allowedTools ?? []);
  const denied = JSON.stringify(params.deniedTools ?? []);
  const mode = params.mode ? String(params.mode) : null;
  const existing = await db.select().from(AgentPermission).where(eq(AgentPermission.agentId, params.agentId));
  if (existing.length > 0) {
    await db
      .update(AgentPermission)
      .set({ mode, allowedTools: allowed, deniedTools: denied, updatedAt: now })
      .where(eq(AgentPermission.agentId, params.agentId));
  } else {
    await db.insert(AgentPermission).values({
      agentId: params.agentId,
      mode,
      allowedTools: allowed,
      deniedTools: denied,
      updatedAt: now,
    });
  }
  resetPermissionEngineCache();
}

export async function deleteAgentPermission(agentId: string): Promise<void> {
  const { db, AgentPermission } = await loadAstroDb();
  if (!AgentPermission) return;
  await db.delete(AgentPermission).where(eq(AgentPermission.agentId, agentId));
  resetPermissionEngineCache();
}

export const HARD_DENY_PATTERN_IDS = HARD_DENY_PATTERNS.map((r) => r.id);
