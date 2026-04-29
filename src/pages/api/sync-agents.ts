import type { APIRoute } from 'astro';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { getForgeRepoRoot } from '../../lib/forge-repo-root';
import { loadAstroDb } from '../../lib/load-astro-db';
import { buildAgentPolicyContext } from '../../lib/agent-rules';

const GLOBAL_POLICY_START = '<!-- FORGE_GLOBAL_POLICY_START -->';
const GLOBAL_POLICY_END = '<!-- FORGE_GLOBAL_POLICY_END -->';

function renderLanguagePolicy(preferredLanguage: string): string {
  if (preferredLanguage === 'en') return '- Language policy: English only for chat/reports.';
  if (preferredLanguage === 'fr_en')
    return '- Language policy: French first, then English for chat/reports.';
  return '- Politique de langue: francais pour chat/rapports.';
}

function stripGlobalPolicyBlock(prompt: string): string {
  const start = prompt.indexOf(GLOBAL_POLICY_START);
  const end = prompt.indexOf(GLOBAL_POLICY_END);
  if (start >= 0 && end > start) {
    return `${prompt.slice(0, start).trim()}\n`;
  }
  return prompt;
}

function applyGlobalPolicyToPrompt(prompt: string, preferredLanguage: string, buildRules: string): string {
  const clean = stripGlobalPolicyBlock(String(prompt || '')).trim();
  const policyLines = [
    GLOBAL_POLICY_START,
    '## Forge Global Policy',
    renderLanguagePolicy(preferredLanguage),
    buildRules ? `- Build rules:\n${buildRules}` : '- Build rules: (none configured)',
    GLOBAL_POLICY_END,
  ];
  return `${clean}\n\n${policyLines.join('\n')}\n`;
}

/**
 * POST /api/sync-agents
 * Lit tous les AgentInstruction actifs dans la DB et régénère les fichiers .md
 * correspondants sur le disque, pour qu'ZimaOS puisse les relire.
 *
 * Body optionnel : { agentId: "DEV_FRONTEND" }  → sync un seul agent
 */
export const POST: APIRoute = async ({ request }) => {
  const { db, AgentInstruction } = await loadAstroDb();
  const body = await request.json().catch(() => ({}));
  const targetAgent: string | undefined = body?.agentId;
  const policy = await buildAgentPolicyContext(undefined);
  const preferredLanguage = policy.preferredLanguage;
  const buildRules = policy.globalRules
    .map(
      (r) =>
        `[${r.scope}${r.projectId != null ? `#${r.projectId}` : ''}] ${r.category}.${r.field} ${r.operator} ${r.value}`,
    )
    .join('\n');

  const repoRoot = getForgeRepoRoot();

  let query = db.select().from(AgentInstruction);
  const rows = await query;

  const toSync = targetAgent
    ? rows.filter(r => r.agentId === targetAgent)
    : rows.filter(r => r.enabled === 1);

  if (!toSync.length) {
    return new Response(JSON.stringify({ ok: false, error: 'Aucun agent trouvé' }), { status: 404 });
  }

  const synced: string[] = [];
  const errors: { agentId: string; error: string }[] = [];

  for (const agent of toSync) {
    try {
      const fullPath = resolve(repoRoot, agent.filePath);
      mkdirSync(dirname(fullPath), { recursive: true });
      const promptWithPolicy = applyGlobalPolicyToPrompt(
        String(agent.systemPrompt || ''),
        preferredLanguage,
        buildRules,
      );
      writeFileSync(fullPath, promptWithPolicy, 'utf-8');
      synced.push(agent.agentId);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push({ agentId: agent.agentId, error: message });
    }
  }

  return new Response(
    JSON.stringify({
      ok: true,
      synced,
      errors,
      total: toSync.length,
      appliedPolicy: {
        preferredLanguage,
        hasBuildRules: Boolean(buildRules),
      },
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );
};

/** GET /api/sync-agents → statut (liste les agents et si leur fichier existe) */
export const GET: APIRoute = async () => {
  const { db, AgentInstruction } = await loadAstroDb();
  const { existsSync } = await import('node:fs');
  const repoRoot = getForgeRepoRoot();
  const rows = await db.select().from(AgentInstruction);

  const status = rows.map(agent => ({
    agentId:   agent.agentId,
    model:     agent.model,
    filePath:  agent.filePath,
    enabled:   agent.enabled === 1,
    fileExists: existsSync(resolve(repoRoot, agent.filePath)),
    updatedAt: agent.updatedAt,
  }));

  return new Response(JSON.stringify(status), {
    headers: { 'Content-Type': 'application/json' },
  });
};
