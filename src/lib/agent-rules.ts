import { loadAstroDb } from './load-astro-db';
import { eq } from 'drizzle-orm';
import { getConfig, setConfig } from './config-db';

export type AgentRuleCategory =
  | 'framework'
  | 'ui'
  | 'language'
  | 'reporting'
  | 'quality'
  | 'custom';

export type AgentRule = {
  id: string;
  scope: 'global' | 'project';
  projectId: number | null;
  category: AgentRuleCategory;
  name: string;
  type: string;
  rule: string;
  field: string;
  operator: 'is' | 'contains' | 'in';
  value: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

function normalizeRule(raw: unknown): AgentRule | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const id = String(r.id || '').trim();
  const category = String(r.category || '').trim() as AgentRuleCategory;
  if (!id || !category) return null;
  const scope = String(r.scope || 'global') === 'project' ? 'project' : 'global';
  const projectId = typeof r.projectId === 'number' && Number.isFinite(r.projectId) ? r.projectId : null;
  const name = String(r.name || r.field || category || 'Regle').trim();
  const type = String(r.type || r.field || '').trim();
  const rule = String(r.rule || r.value || '').trim();
  const field = String(r.field || '').trim();
  const operator = (['is', 'contains', 'in'].includes(String(r.operator)) ? String(r.operator) : 'is') as
    | 'is'
    | 'contains'
    | 'in';
  const value = String(r.value || '').trim();
  const effectiveField = field || type;
  const effectiveValue = value || rule;
  const nowIso = new Date().toISOString();
  return {
    id,
    scope,
    projectId,
    category,
    name,
    type,
    rule,
    field: effectiveField,
    operator,
    value: effectiveValue,
    enabled: Boolean(r.enabled ?? true),
    createdAt: String(r.createdAt || nowIso),
    updatedAt: String(r.updatedAt || nowIso),
  };
}

export async function getAgentRules(): Promise<AgentRule[]> {
  const raw = (await getConfig('agentPolicyRules')).trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeRule).filter(Boolean) as AgentRule[];
  } catch {
    return [];
  }
}

export async function saveAgentRules(rules: AgentRule[]): Promise<void> {
  await setConfig({ agentPolicyRules: JSON.stringify(rules) });
}

export async function buildAgentPolicyContext(projectId?: number, agentId?: string): Promise<{
  preferredLanguage: string;
  instructionText: string;
  globalRules: AgentRule[];
  scopedRules: AgentRule[];
  strictMode: 'off' | 'warn' | 'enforce';
  agentPrompt?: string;
}> {
  const { db, AgentInstruction } = await loadAstroDb();
  let agentPrompt = '';
  if (agentId) {
    try {
      const inst = await db.select().from(AgentInstruction).where(eq(AgentInstruction.agentId, agentId)).limit(1);
      if (inst.length > 0) {
        agentPrompt = inst[0].systemPrompt || '';
      }
    } catch (e) {
      console.warn(`[agent-rules] Failed to fetch instruction for ${agentId}:`, e);
    }
  }
  const all = (await getAgentRules()).filter((r) => r.enabled);
  const globalRules = all.filter((r) => r.scope === 'global');
  const projectRules =
    typeof projectId === 'number' ? all.filter((r) => r.scope === 'project' && r.projectId === projectId) : [];
  const scopedRules = [...globalRules, ...projectRules];

  const legacyLanguage = (await getConfig('agentPreferredLanguage')).trim() || 'fr';
  const languageRule = scopedRules.find((r) => r.category === 'reporting' && r.field === 'preferred_language');
  const preferredLanguage = String(languageRule?.value || legacyLanguage || 'fr').trim();

  const legacyRules = (await getConfig('agentGlobalBuildRules')).trim();
  const strictRule = scopedRules.find((r) => r.category === 'quality' && /strict_mode_(warn|enforce)/i.test(r.value));
  const strictMode = /strict_mode_enforce/i.test(String(strictRule?.value || ''))
    ? 'enforce'
    : /strict_mode_warn/i.test(String(strictRule?.value || ''))
      ? 'warn'
      : 'off';
  const ruleLines = scopedRules.map(
    (r) =>
      `- [${r.scope}${r.projectId != null ? `#${r.projectId}` : ''}] ${r.category}.${r.field} ${r.operator} ${r.value}`,
  );
  const instructionText = [
    agentPrompt,
    preferredLanguage === 'en'
      ? 'Always answer in English.'
      : preferredLanguage === 'fr_en'
        ? 'Answer in French first, then provide an English version.'
        : 'Toujours repondre en francais.',
    strictMode !== 'off'
      ? `Strict mode: ${strictMode}. A la fin de ta reponse, ajoute obligatoirement ce bloc:` +
        '\n<FORGE_RULES_AUDIT>{"rules_ok":true|false,"failed_rule_ids":["..."],"notes":"..."}</FORGE_RULES_AUDIT>'
      : '',
    ruleLines.length ? `Agent rules:\n${ruleLines.join('\n')}` : '',
    legacyRules ? `Legacy global rules:\n${legacyRules}` : '',
    `
CAPABILITIES & FORMATS:
1. PLANNING: If you identify multiple tasks to improve the project, output a plan block:
<FORGE_PLAN>
[
  {"title": "Nom de la tâche 1", "content": "Description détaillée", "assignee": "DEV_FRONTEND"},
  {"title": "Nom de la tâche 2", "content": "Description détaillée", "assignee": "DEV_BACKEND"}
]
</FORGE_PLAN>
Chaque élément deviendra une demande dans le carnet de bord.

2. TASK UPDATES: Pour marquer une tâche comme terminée, utilise le format:
[FORGE_TOOL_EXEC]
{"tool": "update_request_status", "requestId": 123, "status": "completed"}
`
  ]
    .filter(Boolean)
    .join('\n\n');

  return { preferredLanguage, instructionText, globalRules, scopedRules, strictMode, agentPrompt };
}

