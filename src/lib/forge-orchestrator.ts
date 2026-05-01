import { getOllamaOriginResolved } from './config-db';
import { buildAgentPolicyContext } from './agent-rules';
import { runForgeTool, type ForgeToolResult, type ForgeToolCall } from './forge-tool-bus';
import { loadAstroDb } from './load-astro-db';

export type ForgeOrchestratorInput = {
  agentId: string;
  message: string;
  modelHint?: string;
  projectId?: number;
  sessionId?: string;
};

export type ForgeOrchestratorOutput = {
  reply: string;
  provider: string;
  model: string;
  steps: Array<{ type: string; label: string; payload?: string; status: string }>;
  toolResult?: ForgeToolResult;
};

type RuleAudit = {
  rules_ok: boolean;
  failed_rule_ids?: string[];
  notes?: string;
};



async function resolveAvailableModel(preferred: string): Promise<{ origin: string, model: string }> {
  const defaultOrigin = (await getOllamaOriginResolved()).replace(/\/$/, '');
  let instances: any[] = [];
  let compatibleModels: string[] = [];
  let globalDefault = 'qwen2.5:7b';

  try {
    const { db, OllamaInstance, Config, eq, like } = await loadAstroDb();
    if (OllamaInstance) {
      instances = await db.select().from(OllamaInstance).where(eq(OllamaInstance.enabled, 1));
    }
    // Charger les modèles marqués comme compatibles
    const compatibilityConfigs = await db.select().from(Config).where(like(Config.key, 'compatibility_ollama_%'));
    compatibleModels = compatibilityConfigs
      .filter(c => {
        try {
          return JSON.parse(c.value).ok === true;
        } catch { return false; }
      })
      .map(c => c.key.replace('compatibility_ollama_', ''));
    
    // Charger le défaut global
    const defRow = await db.select().from(Config).where(eq(Config.key, 'agentDefaultModel'));
    if (defRow.length && defRow[0].value && defRow[0].value !== 'Auto') {
      globalDefault = defRow[0].value;
    }
  } catch {}
  
  const isAuto = !preferred || preferred.toLowerCase() === 'auto';
  const candidateOrigins = [defaultOrigin];
  for (const inst of instances) {
    const url = String(inst.url || '').trim().replace(/\/$/, '');
    if (url && !candidateOrigins.includes(url)) candidateOrigins.push(url);
  }

  const allFound: Array<{ origin: string, models: string[] }> = [];

  for (const origin of candidateOrigins) {
    try {
      const res = await fetch(`${origin}/api/tags`, { signal: AbortSignal.timeout(5_000) });
      if (!res.ok) continue;
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      const models = Array.isArray(data.models) ? (data.models as Array<Record<string, unknown>>) : [];
      const names = models.map((m) => String(m.name || m.model || '').trim()).filter(Boolean);
      
      if (!isAuto && names.includes(preferred)) {
        return { origin, model: preferred };
      }
      
      // Si Auto, on cherche en priorité un modèle compatible connu sur cette instance
      if (isAuto) {
        for (const comp of compatibleModels) {
          if (names.includes(comp)) {
            return { origin, model: comp };
          }
        }
      }

      if (names.length > 0) {
        allFound.push({ origin, models: names });
      }
    } catch {
      // ignore
    }
  }

  // Fallback si pas de modèle compatible trouvé ou si preferred non trouvé
  const fallbacks = isAuto 
    ? [globalDefault, 'qwen2.5-coder:7b', 'qwen2.5-coder:32b', 'qwen2.5:7b', 'llama3.2:latest']
    : [preferred, globalDefault, 'qwen2.5:7b', 'llama3.2:latest'];

  for (const candidate of fallbacks) {
    for (const found of allFound) {
      if (found.models.includes(candidate)) {
        return { origin: found.origin, model: candidate };
      }
    }
  }

  if (allFound.length > 0) {
    return { origin: allFound[0].origin, model: allFound[0].models[0] };
  }

  return { origin: defaultOrigin, model: isAuto ? 'qwen2.5:7b' : preferred };
}

function parseInlineToolDirective(message: string): ForgeToolCall | null {
  const m = String(message || '').match(/\[FORGE_TOOL_EXEC\]([\s\S]*)$/i);
  if (!m) return null;
  const raw = m[1].trim();
  try {
    return JSON.parse(raw) as ForgeToolCall;
  } catch {
    return { tool: 'exec', command: raw };
  }
}

function extractRuleAudit(reply: string): { cleaned: string; audit: RuleAudit | null } {
  const m = String(reply || '').match(/<FORGE_RULES_AUDIT>([\s\S]*?)<\/FORGE_RULES_AUDIT>/i);
  if (!m) return { cleaned: String(reply || '').trim(), audit: null };
  try {
    const audit = JSON.parse(m[1]) as RuleAudit;
    const cleaned = String(reply || '').replace(m[0], '').trim();
    return { cleaned, audit };
  } catch {
    return { cleaned: String(reply || '').replace(m[0], '').trim(), audit: null };
  }
}

export type ForgePlanItem = { title: string; content?: string; assignee?: string };

function extractForgePlan(reply: string): { cleaned: string; plan: ForgePlanItem[] | null } {
  const m = String(reply || '').match(/<FORGE_PLAN>([\s\S]*?)<\/FORGE_PLAN>/i);
  if (!m) return { cleaned: String(reply || '').trim(), plan: null };
  try {
    const plan = JSON.parse(m[1]) as ForgePlanItem[];
    const cleaned = String(reply || '').replace(m[0], '').trim();
    return { cleaned, plan };
  } catch {
    // Fallback parsing simple markdown list if JSON fails
    const cleaned = String(reply || '').replace(m[0], '').trim();
    const lines = m[1].split('\n').filter(l => l.trim().startsWith('-'));
    const plan = lines.map(l => ({ title: l.trim().slice(1).trim() }));
    return { cleaned, plan: plan.length > 0 ? plan : null };
  }
}

function extractReasoning(reply: string): { cleaned: string; reasoning: string | null } {
  // On cherche des blocs <thought> ou une section "Réflexion :"
  const m = String(reply || '').match(/<thought>([\s\S]*?)<\/thought>/i) || 
            String(reply || '').match(/Réflexion\s*:\s*([\s\S]*?)(?=\n\n|\n\[|$)/i);
  if (!m) return { cleaned: String(reply || '').trim(), reasoning: null };
  const reasoning = m[1].trim();
  const cleaned = String(reply || '').replace(m[0], '').trim();
  return { cleaned, reasoning };
}

export async function runForgeOrchestrator(input: ForgeOrchestratorInput): Promise<ForgeOrchestratorOutput & { plan?: ForgePlanItem[] | null }> {
  const steps: ForgeOrchestratorOutput['steps'] = [];
  const { db, ForgeChatStep } = await loadAstroDb();

  const persistStep = async (s: ForgeOrchestratorOutput['steps'][0]) => {
    steps.push(s);
    if (input.sessionId) {
      try {
        await db.insert(ForgeChatStep).values({
          sessionId: input.sessionId,
          type: s.type,
          label: s.label,
          payload: typeof s.payload === 'string' ? s.payload : JSON.stringify(s.payload),
          status: s.status,
          createdAt: new Date(),
        });
      } catch (e) {
        console.warn('[orchestrator] step persist failed:', e);
      }
    }
  };

  const preferredModel = String(input.modelHint || '').trim() || process.env.OLLAMA_MODEL?.trim() || 'llama3.2:latest';
  const { origin, model } = await resolveAvailableModel(preferredModel);
  const policy = await buildAgentPolicyContext(input.projectId, input.agentId);
  const timeoutMs = 90_000;
  
  let currentMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    ...(policy.instructionText ? [{ role: 'system' as const, content: policy.instructionText }] : []),
    { role: 'user' as const, content: input.message },
  ];

  let turn = 0;
  const maxTurns = 5;
  let finalReply = '';
  let finalPlan: ForgePlanItem[] | null = null;
  let lastToolResult: ForgeToolResult | undefined;

  while (turn < maxTurns) {
    turn++;
    await persistStep({ type: 'llm', label: turn === 1 ? 'ollama_chat' : `réflexion_tour_${turn}`, payload: model, status: 'running' });
    
    const res = await fetch(`${origin}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, stream: false, messages: currentMessages }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!res.ok) {
      const err = `Erreur Ollama HTTP ${res.status}`;
      await persistStep({ type: 'llm', label: 'error', payload: err, status: 'failed' });
      return { reply: err, provider: 'ollama', model, steps, plan: null };
    }

    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    const rawReply = typeof (data.message as any)?.content === 'string' ? String((data.message as any).content).trim() : '';
    
    // Extraction des composants
    let { cleaned, audit } = extractRuleAudit(rawReply);
    let { cleaned: afterReasoning, reasoning } = extractReasoning(cleaned);
    let { cleaned: afterPlan, plan } = extractForgePlan(afterReasoning);
    const toolCall = parseInlineToolDirective(afterPlan);

    if (reasoning) {
      await persistStep({ type: 'thought', label: 'Réflexion de l\'agent', payload: reasoning, status: 'completed' });
    }
    if (plan) finalPlan = plan;

    if (toolCall) {
      const label = toolCall.tool === 'exec' ? `Commande: ${(toolCall.command || '').slice(0, 40)}...` : `Tool: ${toolCall.tool}`;
      await persistStep({ type: 'tool', label, payload: JSON.stringify(toolCall), status: 'running' });
      
      const toolResult = await runForgeTool(toolCall);
      lastToolResult = toolResult;
      
      await persistStep({
        type: 'tool',
        label: toolResult.ok ? 'Action terminée' : 'Échec de l\'action',
        payload: toolResult.ok ? (String(toolResult.output || '').slice(0, 1000) || 'ok') : toolResult.error || 'error',
        status: toolResult.ok ? 'completed' : 'failed',
      });

      // On boucle avec le résultat de l'outil
      currentMessages.push({ role: 'assistant', content: rawReply });
      currentMessages.push({ role: 'user', content: `[TOOL_RESULT]\n${String(toolResult.output || toolResult.error || '')}` });
      continue;
    }

    // Pas d'outil, c'est la réponse finale
    finalReply = afterPlan;
    await persistStep({ type: 'llm', label: 'ollama_chat', payload: 'ok', status: 'completed' });
    break;
  }

  return {
    reply: finalReply || 'Réponse vide.',
    provider: 'ollama',
    model,
    steps,
    toolResult: lastToolResult,
    plan: finalPlan,
  };
}

