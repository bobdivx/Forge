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
  turnId?: string;
  onStep?: (step: ForgeOrchestratorOutput['steps'][0]) => void | Promise<void>;
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

function truncateForStep(value: string, max = 1200): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

function countLines(value: string): number {
  if (!value) return 0;
  return value.split(/\r?\n/).length;
}

function stringifyStepPayload(payload: unknown): string {
  return typeof payload === 'string' ? payload : JSON.stringify(payload);
}

function buildToolStartStep(toolCall: ForgeToolCall, turnId?: string, stepId?: string): ForgeOrchestratorOutput['steps'][0] {
  if (toolCall.tool === 'read_file') {
    return {
      type: 'file',
      label: `Lecture ${toolCall.path}`,
      payload: stringifyStepPayload({ kind: 'read_file', path: toolCall.path, turnId, stepId }),
      status: 'running',
    };
  }
  if (toolCall.tool === 'write_file') {
    return {
      type: 'file',
      label: `Modification ${toolCall.path}`,
      payload: stringifyStepPayload({
        kind: 'write_file',
        path: toolCall.path,
        lines: countLines(toolCall.content),
        preview: truncateForStep(toolCall.content, 800),
        turnId,
        stepId,
      }),
      status: 'running',
    };
  }
  if (toolCall.tool === 'exec') {
    const isSearch = /\b(rg|grep|find|select-string)\b/i.test(toolCall.command);
    return {
      type: isSearch ? 'search' : 'command',
      label: `${isSearch ? 'Recherche' : 'Commande'} ${truncateForStep(toolCall.command, 80)}`,
      payload: stringifyStepPayload({ kind: 'exec', command: toolCall.command, turnId, stepId }),
      status: 'running',
    };
  }
  if (toolCall.tool === 'update_request_status') {
    return {
      type: 'task',
      label: `Mise à jour demande #${toolCall.requestId}`,
      payload: stringifyStepPayload({ kind: 'update_request_status', requestId: toolCall.requestId, status: toolCall.status, turnId, stepId }),
      status: 'running',
    };
  }
  return {
    type: 'command',
    label: `Redémarrage ${toolCall.containerName || 'gateway'}`,
    payload: stringifyStepPayload({ kind: 'restart_gateway', containerName: toolCall.containerName || null, turnId, stepId }),
    status: 'running',
  };
}

function buildToolResultStep(toolCall: ForgeToolCall, toolResult: ForgeToolResult, turnId?: string, stepId?: string): ForgeOrchestratorOutput['steps'][0] {
  const output = String(toolResult.output || '');
  const error = String(toolResult.error || '');
  const basePayload = {
    kind: toolCall.tool,
    ok: toolResult.ok,
    output: truncateForStep(output, 4000),
    error: truncateForStep(error, 1600),
    diff: truncateForStep(String(toolResult.diff || ''), 8000),
    addedLines: toolResult.addedLines,
    deletedLines: toolResult.deletedLines,
    durationMs: toolResult.durationMs,
    exitCode: toolResult.exitCode,
    turnId,
    stepId,
  };

  if (toolCall.tool === 'read_file') {
    return {
      type: 'file',
      label: toolResult.ok ? `Lu ${toolCall.path}` : `Lecture échouée ${toolCall.path}`,
      payload: stringifyStepPayload({ ...basePayload, path: toolCall.path, lines: countLines(output) }),
      status: toolResult.ok ? 'completed' : 'failed',
    };
  }
  if (toolCall.tool === 'write_file') {
    return {
      type: 'file',
      label: toolResult.ok ? `Modifié ${toolCall.path}` : `Modification échouée ${toolCall.path}`,
      payload: stringifyStepPayload({
        ...basePayload,
        path: toolCall.path,
        lines: countLines(toolCall.content),
        beforeLines: countLines(toolResult.beforeContent || ''),
        afterLines: countLines(toolResult.afterContent || ''),
      }),
      status: toolResult.ok ? 'completed' : 'failed',
    };
  }
  if (toolCall.tool === 'exec') {
    const isSearch = /\b(rg|grep|find|select-string)\b/i.test(toolCall.command);
    return {
      type: isSearch ? 'search' : 'command',
      label: toolResult.ok ? `${isSearch ? 'Recherche terminée' : 'Commande terminée'}` : `${isSearch ? 'Recherche échouée' : 'Commande échouée'}`,
      payload: stringifyStepPayload({ ...basePayload, command: toolCall.command }),
      status: toolResult.ok ? 'completed' : 'failed',
    };
  }
  if (toolCall.tool === 'update_request_status') {
    return {
      type: 'task',
      label: toolResult.ok ? `Demande #${toolCall.requestId} mise à jour` : `Mise à jour demande échouée`,
      payload: stringifyStepPayload({ ...basePayload, requestId: toolCall.requestId, status: toolCall.status }),
      status: toolResult.ok ? 'completed' : 'failed',
    };
  }
  return {
    type: 'command',
    label: toolResult.ok ? 'Redémarrage terminé' : 'Redémarrage échoué',
    payload: stringifyStepPayload({ ...basePayload, containerName: toolCall.containerName || null }),
    status: toolResult.ok ? 'completed' : 'failed',
  };
}

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
    // Charger les modèles marqués comme compatibles (et non désactivés manuellement)
    const compatibilityConfigs = await db.select().from(Config).where(like(Config.key, 'compatibility_ollama_%'));
    compatibleModels = compatibilityConfigs
      .filter(c => {
        try {
          const val = JSON.parse(c.value);
          return val.ok === true && val.disabledManually !== true;
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
  const turnId = input.turnId;

  const persistStep = async (s: ForgeOrchestratorOutput['steps'][0]) => {
    const payload =
      s.payload && typeof s.payload === 'string'
        ? (() => {
            try {
              const parsed = JSON.parse(s.payload);
              return JSON.stringify({ ...parsed, turnId });
            } catch {
              return s.payload;
            }
          })()
        : s.payload;
    const step = { ...s, payload };
    steps.push(step);
    await input.onStep?.(step);
    if (input.sessionId) {
      try {
        await db.insert(ForgeChatStep).values({
          sessionId: input.sessionId,
          type: step.type,
          label: step.label,
          payload: typeof step.payload === 'string' ? step.payload : JSON.stringify(step.payload),
          status: step.status,
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
    let { cleaned } = extractRuleAudit(rawReply);
    let { cleaned: afterReasoning, reasoning } = extractReasoning(cleaned);
    let { cleaned: afterPlan, plan } = extractForgePlan(afterReasoning);
    const toolCall = parseInlineToolDirective(afterPlan);

    if (reasoning) {
      await persistStep({ type: 'thought', label: 'Réflexion de l\'agent', payload: reasoning, status: 'completed' });
    }
    if (plan) finalPlan = plan;

    if (toolCall) {
      const stepId = `${turnId || 'turn'}-tool-${turn}-${Date.now()}`;
      await persistStep(buildToolStartStep(toolCall, turnId, stepId));
      
      const toolResult = await runForgeTool(toolCall);
      lastToolResult = toolResult;
      
      await persistStep(buildToolResultStep(toolCall, toolResult, turnId, stepId));

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

