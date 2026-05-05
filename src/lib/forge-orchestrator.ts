import { getAllConfig, getOllamaOriginResolved } from './config-db';
import { buildAgentPolicyContext } from './agent-rules';
import {
  runForgeTool,
  executeDynamicTool,
  type ForgeToolResult,
  type ForgeToolCall,
  type ToolExecutionContext,
} from './forge-tool-bus';
import { loadAstroDb } from './load-astro-db';
import { getSelectableOllamaModels } from './ollama-model-availability';
import { getEffectiveToolsForAgent, type EffectiveTool } from './forge-tool-catalog';

type OllamaToolCall = {
  function?: {
    name?: string;
    arguments?: unknown;
  };
};

type OrchestratorMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: OllamaToolCall[];
};

function coerceArguments(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>;
    } catch {
      /* ignore */
    }
  }
  return {};
}

function summarizeToolResultForModel(result: ForgeToolResult): string {
  if (result.ok) {
    const out = String(result.output || '').trim();
    return out || 'ok';
  }
  return `[ERROR] ${String(result.error || 'Outil en échec')}`;
}

/** Construit le tableau `tools` exposé via l'API native Ollama. */
function buildOllamaToolSchemas(tools: EffectiveTool[]) {
  return tools.map((t) => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));
}

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

function categorizeStepType(tool: EffectiveTool): string {
  if (tool.category === 'filesystem') return 'file';
  if (tool.category === 'forge') return 'task';
  if (tool.category === 'shell' || tool.category === 'git' || tool.category === 'github') return 'command';
  return 'command';
}

function buildDynamicToolStartStep(
  tool: EffectiveTool,
  args: Record<string, unknown>,
  turnId?: string,
  stepId?: string,
): ForgeOrchestratorOutput['steps'][0] {
  const summary = (() => {
    if (tool.name === 'read_file') return `Lecture ${String(args.path || '')}`;
    if (tool.name === 'write_file') return `Modification ${String(args.path || '')}`;
    if (tool.name === 'exec') return `Commande ${truncateForStep(String(args.command || ''), 80)}`;
    if (tool.name === 'update_request_status') return `Mise à jour demande #${args.requestId}`;
    if (tool.name === 'restart_gateway') return `Redémarrage ${args.containerName || 'gateway'}`;
    return `${tool.displayName}${Object.keys(args).length ? ` ${truncateForStep(JSON.stringify(args), 80)}` : ''}`;
  })();
  return {
    type: categorizeStepType(tool),
    label: summary,
    payload: stringifyStepPayload({ kind: tool.name, args, turnId, stepId }),
    status: 'running',
  };
}

function buildDynamicToolResultStep(
  tool: EffectiveTool,
  args: Record<string, unknown>,
  result: ForgeToolResult,
  turnId?: string,
  stepId?: string,
): ForgeOrchestratorOutput['steps'][0] {
  const output = String(result.output || '');
  const error = String(result.error || '');
  const basePayload = {
    kind: tool.name,
    ok: result.ok,
    args,
    output: truncateForStep(output, 4000),
    error: truncateForStep(error, 1600),
    diff: truncateForStep(String(result.diff || ''), 8000),
    addedLines: result.addedLines,
    deletedLines: result.deletedLines,
    durationMs: result.durationMs,
    exitCode: result.exitCode,
    turnId,
    stepId,
  };
  const summary = (() => {
    const ok = result.ok;
    if (tool.name === 'read_file') return ok ? `Lu ${String(args.path || '')}` : `Lecture échouée ${String(args.path || '')}`;
    if (tool.name === 'write_file')
      return ok ? `Modifié ${String(args.path || '')}` : `Modification échouée ${String(args.path || '')}`;
    if (tool.name === 'exec') return ok ? 'Commande terminée' : 'Commande échouée';
    if (tool.name === 'update_request_status')
      return ok ? `Demande #${args.requestId} mise à jour` : 'Mise à jour demande échouée';
    if (tool.name === 'restart_gateway') return ok ? 'Redémarrage terminé' : 'Redémarrage échoué';
    return ok ? `${tool.displayName} ok` : `${tool.displayName} échec`;
  })();
  return {
    type: categorizeStepType(tool),
    label: summary,
    payload: stringifyStepPayload(basePayload),
    status: result.ok ? 'completed' : 'failed',
  };
}

async function resolveAvailableModel(preferred: string): Promise<{ origin: string; model: string }> {
  const defaultOrigin = (await getOllamaOriginResolved()).replace(/\/$/, '');
  const config = await getAllConfig();
  const globalDefault = config.agentDefaultModel && config.agentDefaultModel !== 'Auto' ? config.agentDefaultModel : 'qwen2.5:7b';
  const isAuto = !preferred || preferred.toLowerCase() === 'auto';
  const selectable = await getSelectableOllamaModels();
  const byName = new Map(selectable.map((m) => [m.name.toLowerCase(), m]));

  if (!isAuto) {
    const exact = byName.get(preferred.toLowerCase());
    if (exact) return { origin: exact.origin, model: exact.name };
  }

  const compatible = selectable.find((m) => m.compatibility?.ok === true);
  const fallbacks = [globalDefault, 'qwen2.5:7b', 'gemma4:latest', 'qwen2.5-coder:7b', 'qwen2.5-coder:32b', 'llama3.2:latest'];
  for (const candidate of fallbacks) {
    const match = byName.get(candidate.toLowerCase());
    if (match) return { origin: match.origin, model: match.name };
  }

  if (compatible) return { origin: compatible.origin, model: compatible.name };
  if (selectable.length > 0) return { origin: selectable[0].origin, model: selectable[0].name };
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
    const cleaned = String(reply || '').replace(m[0], '').trim();
    const lines = m[1].split('\n').filter((l) => l.trim().startsWith('-'));
    const plan = lines.map((l) => ({ title: l.trim().slice(1).trim() }));
    return { cleaned, plan: plan.length > 0 ? plan : null };
  }
}

function extractReasoning(reply: string): { cleaned: string; reasoning: string | null } {
  const m =
    String(reply || '').match(/<thought>([\s\S]*?)<\/thought>/i) ||
    String(reply || '').match(/Réflexion\s*:\s*([\s\S]*?)(?=\n\n|\n\[|$)/i);
  if (!m) return { cleaned: String(reply || '').trim(), reasoning: null };
  const reasoning = m[1].trim();
  const cleaned = String(reply || '').replace(m[0], '').trim();
  return { cleaned, reasoning };
}

export async function runForgeOrchestrator(
  input: ForgeOrchestratorInput,
): Promise<ForgeOrchestratorOutput & { plan?: ForgePlanItem[] | null }> {
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

  // Charge dynamiquement la liste d'outils disponibles pour cet agent.
  const effectiveTools = await getEffectiveToolsForAgent(input.agentId);
  const policy = await buildAgentPolicyContext(input.projectId, input.agentId, effectiveTools);
  const toolsByName = new Map(effectiveTools.map((t) => [t.name, t]));
  const ollamaTools = buildOllamaToolSchemas(effectiveTools);
  const execContext: ToolExecutionContext = { agentId: input.agentId, projectId: input.projectId };

  const timeoutMs = 90_000;

  const currentMessages: OrchestratorMessage[] = [
    ...(policy.instructionText ? [{ role: 'system' as const, content: policy.instructionText }] : []),
    { role: 'user' as const, content: input.message },
  ];

  let turn = 0;
  const maxTurns = 8;
  let finalReply = '';
  let finalPlan: ForgePlanItem[] | null = null;
  let lastToolResult: ForgeToolResult | undefined;

  while (turn < maxTurns) {
    turn++;
    await persistStep({
      type: 'llm',
      label: turn === 1 ? 'ollama_chat' : `réflexion_tour_${turn}`,
      payload: model,
      status: 'running',
    });

    const res = await fetch(`${origin}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        stream: false,
        messages: currentMessages,
        tools: ollamaTools.length > 0 ? ollamaTools : undefined,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!res.ok) {
      const err = `Erreur Ollama HTTP ${res.status}`;
      await persistStep({ type: 'llm', label: 'error', payload: err, status: 'failed' });
      return { reply: err, provider: 'ollama', model, steps, plan: null };
    }

    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    const msg = (data.message as Record<string, unknown> | undefined) ?? undefined;
    const rawReply = typeof msg?.content === 'string' ? String(msg.content).trim() : '';
    const nativeToolCalls: OllamaToolCall[] = Array.isArray(msg?.tool_calls)
      ? (msg!.tool_calls as OllamaToolCall[])
      : [];

    // 1) Mode natif : tool_calls Ollama
    if (nativeToolCalls.length > 0) {
      currentMessages.push({
        role: 'assistant',
        content: rawReply,
        tool_calls: nativeToolCalls,
      });

      let executed = 0;
      for (const nativeCall of nativeToolCalls) {
        const toolName = String(nativeCall?.function?.name || '').trim();
        const tool = toolsByName.get(toolName);
        const args = coerceArguments(nativeCall?.function?.arguments);

        if (!tool) {
          currentMessages.push({
            role: 'tool',
            content: `[ERROR] Outil "${toolName}" non disponible pour ${input.agentId}.`,
          });
          continue;
        }

        const stepId = `${turnId || 'turn'}-tool-${turn}-${++executed}-${Date.now()}`;
        await persistStep(buildDynamicToolStartStep(tool, args, turnId, stepId));

        const toolResult = await executeDynamicTool(tool, args, execContext);
        lastToolResult = toolResult;

        await persistStep(buildDynamicToolResultStep(tool, args, toolResult, turnId, stepId));

        currentMessages.push({
          role: 'tool',
          content: summarizeToolResultForModel(toolResult),
        });
      }
      continue;
    }

    // 2) Fallback texte [FORGE_TOOL_EXEC] (modèles non tool-aware)
    const { cleaned } = extractRuleAudit(rawReply);
    const { cleaned: afterReasoning, reasoning } = extractReasoning(cleaned);
    const { cleaned: afterPlan, plan } = extractForgePlan(afterReasoning);
    const inlineTool = parseInlineToolDirective(afterPlan);

    if (reasoning) {
      await persistStep({ type: 'thought', label: "Réflexion de l'agent", payload: reasoning, status: 'completed' });
    }
    if (plan) finalPlan = plan;

    if (inlineTool) {
      const stepId = `${turnId || 'turn'}-tool-${turn}-${Date.now()}`;
      // Pour le fallback on utilise l'API legacy (5 outils builtin)
      const tool = toolsByName.get(inlineTool.tool);
      if (tool) {
        const args: Record<string, unknown> = { ...inlineTool };
        delete (args as { tool?: unknown }).tool;
        await persistStep(buildDynamicToolStartStep(tool, args, turnId, stepId));
        const toolResult = await executeDynamicTool(tool, args, execContext);
        lastToolResult = toolResult;
        await persistStep(buildDynamicToolResultStep(tool, args, toolResult, turnId, stepId));
        currentMessages.push({ role: 'assistant', content: rawReply });
        currentMessages.push({ role: 'tool', content: summarizeToolResultForModel(toolResult) });
        continue;
      }
      // Fallback ultime : runForgeTool legacy
      const toolResult = await runForgeTool(inlineTool, execContext);
      lastToolResult = toolResult;
      await persistStep({
        type: 'command',
        label: `Outil legacy ${inlineTool.tool}`,
        payload: stringifyStepPayload({ kind: inlineTool.tool, output: toolResult.output, error: toolResult.error }),
        status: toolResult.ok ? 'completed' : 'failed',
      });
      currentMessages.push({ role: 'assistant', content: rawReply });
      currentMessages.push({ role: 'tool', content: summarizeToolResultForModel(toolResult) });
      continue;
    }

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
