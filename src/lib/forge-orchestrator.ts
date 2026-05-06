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
import {
  geminiChat,
  isGeminiAvailable,
  isGeminiModelId,
  normalizeGeminiModelId,
  type GeminiToolSchema,
} from './gemini-provider';
import { getFunctionalGeminiModels, isRetriableGeminiHttpStatus } from './gemini-model-availability';

type OllamaToolCall = {
  /**
   * Identifiant retourné par le provider (Gemini OpenAI-compat, ou nous-mêmes pour Ollama).
   * REQUIS sur les tours suivants pour que Gemini puisse rattacher le résultat
   * du tool (`role: 'tool'` + `tool_call_id`). Sans cet ID → HTTP 400.
   */
  id?: string;
  type?: 'function';
  function?: {
    name?: string;
    arguments?: unknown;
  };
};

type OrchestratorMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: OllamaToolCall[];
  /** REQUIS sur les messages `role: 'tool'` pour les providers OpenAI-compatibles (Gemini). */
  tool_call_id?: string;
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

/**
 * Après un échec d'outil, injecte une consigne impérative pour que le modèle
 * retente tout seul (auto-correction) — sans attendre que l'utilisateur reformule.
 *
 * Inspiré du comportement « IDE agent » : l'environnement manque parfois de binaires
 * que les recettes shell supposent présents (ex. curl sur Alpine).
 */
function buildOrchestratorRemediationHint(
  tool: EffectiveTool | undefined,
  args: Record<string, unknown>,
  result: ForgeToolResult,
): string {
  if (result.ok) return '';
  const rawErr = String(result.error || result.output || '');
  const err = rawErr.toLowerCase();
  const toolName = String(tool?.name || result.tool || '').trim();

  // exec / shell : curl absent → http_request ou wget
  if (toolName === 'exec') {
    const isCurlMissing =
      /curl:\s+not\s+found|curl:\s+command\s+not\s+found|\/bin\/sh:\s+curl:\s+not\s+found/i.test(
        rawErr,
      );
    if (isCurlMissing) {
      const cmd = String(args.command || '');
      const urlMatch = cmd.match(/https?:\/\/[^\s'"]+/i);
      const extractedUrl = urlMatch?.[0] || '';
      const urlHint = extractedUrl
        ? `url extraite de ta commande : "${extractedUrl}"`
        : 'url = celle que tu ciblais (ex: http://localhost:4321/api/agents)';
      return (
        '\n\n[FORGE_AUTO_REMEDIATION] curl est ABSENT sur ce runtime. Tu DOIS retenter IMMÉDIATEMENT' +
        ' dans ce même tour de réflexion (sans demander confirmation) :' +
        ' (1) préfère l\'outil http_request (method GET ou PUT selon le cas) avec ' +
        urlHint +
        ' ; ou (2) exec avec wget équivalent (wget -qO- …).' +
        ' Si c\'était un POST/PUT, utilise http_request avec body JSON plutôt que wget.'
      );
    }
  }

  // http_request : connexion refusée vers localhost → rappel PORT
  if (toolName === 'http_request') {
    if (/econnrefused|connection refused/i.test(err) && /localhost|127\.0\.0\.1/.test(err)) {
      return (
        '\n\n[FORGE_AUTO_REMEDIATION] Connexion refusée vers localhost.' +
        ' Si Forge tourne en Docker exposé sur le NAS, l\'API est souvent sur le port publié' +
        ' (ex: http://127.0.0.1:4331) depuis l\'hôte, ou http://localhost:4321 depuis l\'intérieur du conteneur forge.' +
        ' Réessaie http_request avec l\'URL correcte pour CE runtime.'
      );
    }
  }

  return '';
}

function formatToolResultForModel(
  tool: EffectiveTool | undefined,
  args: Record<string, unknown>,
  result: ForgeToolResult,
): string {
  return summarizeToolResultForModel(result) + buildOrchestratorRemediationHint(tool, args, result);
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

type ResolvedModel =
  | { provider: 'ollama'; origin: string; model: string }
  | { provider: 'gemini'; model: string };

async function resolveAvailableModel(
  preferred: string,
  opts?: { skipGemini?: boolean },
): Promise<ResolvedModel> {
  let eff = String(preferred || '').trim();
  if (opts?.skipGemini && isGeminiModelId(eff)) {
    eff = '';
  }
  const defaultOrigin = (await getOllamaOriginResolved()).replace(/\/$/, '');
  const config = await getAllConfig();
  const globalDefault = config.agentDefaultModel && config.agentDefaultModel !== 'Auto' ? config.agentDefaultModel : 'qwen2.5:7b';
  const isAuto = !eff || eff.toLowerCase() === 'auto';
  const geminiOn = await isGeminiAvailable();

  // Modèle préféré explicitement Gemini → routage direct (sans fallback Ollama).
  if (!opts?.skipGemini && !isAuto && isGeminiModelId(eff)) {
    if (!geminiOn) {
      // Provider Gemini non configuré : on retombe sur Ollama pour ne pas bloquer.
      // (le tour LLM produira l'erreur visible côté utilisateur si rien n'est dispo.)
      return { provider: 'ollama', origin: defaultOrigin, model: eff };
    }
    return { provider: 'gemini', model: eff };
  }

  const selectable = await getSelectableOllamaModels();
  const byName = new Map(selectable.map((m) => [m.name.toLowerCase(), m]));

  if (!isAuto) {
    const exact = byName.get(eff.toLowerCase());
    if (exact) return { provider: 'ollama', origin: exact.origin, model: exact.name };
  }

  // Auto : si Gemini est dispo et que le défaut global est Gemini, on l'utilise.
  if (!opts?.skipGemini && isAuto && geminiOn && isGeminiModelId(globalDefault)) {
    return { provider: 'gemini', model: globalDefault };
  }

  const compatible = selectable.find((m) => m.compatibility?.ok === true);
  const fallbacks = [globalDefault, 'qwen2.5:7b', 'gemma4:latest', 'qwen2.5-coder:7b', 'qwen2.5-coder:32b', 'llama3.2:latest'];
  for (const candidate of fallbacks) {
    if (!opts?.skipGemini && isGeminiModelId(candidate) && geminiOn) {
      return { provider: 'gemini', model: candidate };
    }
    const match = byName.get(candidate.toLowerCase());
    if (match) return { provider: 'ollama', origin: match.origin, model: match.name };
  }

  if (compatible) return { provider: 'ollama', origin: compatible.origin, model: compatible.name };
  if (selectable.length > 0) return { provider: 'ollama', origin: selectable[0].origin, model: selectable[0].name };

  // Aucun Ollama dispo : si Gemini activé, dernier recours via modèles réellement joignables.
  if (!opts?.skipGemini && geminiOn) {
    const discovered = await getFunctionalGeminiModels();
    const first = discovered.models[0]?.id;
    if (first) return { provider: 'gemini', model: first };
  }
  return { provider: 'ollama', origin: defaultOrigin, model: isAuto ? 'qwen2.5:7b' : eff };
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
  const resolved = await resolveAvailableModel(preferredModel);
  let provider: 'ollama' | 'gemini' = resolved.provider;
  let model = resolved.model;
  let origin = resolved.provider === 'ollama' ? resolved.origin : '';

  // Charge dynamiquement la liste d'outils disponibles pour cet agent.
  const effectiveTools = await getEffectiveToolsForAgent(input.agentId);
  const policy = await buildAgentPolicyContext(input.projectId, input.agentId, effectiveTools);
  const toolsByName = new Map(effectiveTools.map((t) => [t.name, t]));
  const ollamaTools = buildOllamaToolSchemas(effectiveTools);
  const geminiTools: GeminiToolSchema[] = ollamaTools as GeminiToolSchema[];
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
    const llmLabelBase = provider === 'gemini' ? 'gemini_chat' : 'ollama_chat';
    await persistStep({
      type: 'llm',
      label: turn === 1 ? llmLabelBase : `réflexion_tour_${turn}`,
      payload: model,
      status: 'running',
    });

    let rawReply = '';
    let nativeToolCalls: OllamaToolCall[] = [];

    let workProvider: 'ollama' | 'gemini' = provider;
    let workModel = model;
    let workOrigin = origin;

    const geminiApiMessages = () =>
      currentMessages.map((m) => ({
        role: m.role,
        content: m.content,
        ...(m.tool_calls
          ? {
              tool_calls: m.tool_calls.map((tc) => ({
                id: tc.id,
                type: 'function' as const,
                function: {
                  name: tc.function?.name,
                  arguments:
                    typeof tc.function?.arguments === 'string'
                      ? tc.function?.arguments
                      : JSON.stringify(tc.function?.arguments ?? {}),
                },
              })),
            }
          : {}),
        ...(m.tool_call_id ? { tool_call_id: m.tool_call_id } : {}),
      }));

    if (workProvider === 'gemini') {
      let chat = await geminiChat({
        model: workModel,
        messages: geminiApiMessages(),
        tools: geminiTools.length > 0 ? geminiTools : undefined,
        timeoutMs,
      });

      if (!chat.ok && isRetriableGeminiHttpStatus(chat.status)) {
        const tried = new Set<string>();
        tried.add(normalizeGeminiModelId(workModel).toLowerCase());
        const functional = await getFunctionalGeminiModels();
        for (const alt of functional.models) {
          const id = normalizeGeminiModelId(alt.id);
          const key = id.toLowerCase();
          if (tried.has(key)) continue;
          tried.add(key);
          await persistStep({
            type: 'llm',
            label: 'gemini_model_failover',
            payload: `${workModel} → ${id}`,
            status: 'completed',
          });
          chat = await geminiChat({
            model: id,
            messages: geminiApiMessages(),
            tools: geminiTools.length > 0 ? geminiTools : undefined,
            timeoutMs,
          });
          if (chat.ok) {
            workModel = id;
            break;
          }
          if (!isRetriableGeminiHttpStatus(chat.status)) break;
        }
      }

      if (chat.ok) {
        rawReply = chat.content.trim();
        nativeToolCalls = (chat.toolCalls || []).map((tc, idx) => ({
          id: tc.id || `call_${turnId || 'turn'}_${turn}_${idx}`,
          type: 'function' as const,
          function: {
            name: tc.function?.name,
            arguments: tc.function?.arguments,
          },
        }));
        model = workModel;
        provider = 'gemini';
      } else if (isRetriableGeminiHttpStatus(chat.status)) {
        await persistStep({
          type: 'llm',
          label: 'gemini_ollama_failover',
          payload: String(workModel),
          status: 'running',
        });
        const fb = await resolveAvailableModel(preferredModel, { skipGemini: true });
        if (fb.provider !== 'ollama') {
          const err = `Erreur Gemini ${chat.status}: ${chat.error || 'inconnue'}`;
          await persistStep({ type: 'llm', label: 'error', payload: err, status: 'failed' });
          return { reply: err, provider: 'gemini', model: workModel, steps, plan: null };
        }
        workProvider = 'ollama';
        workModel = fb.model;
        workOrigin = fb.origin;
        provider = 'ollama';
        model = workModel;
        origin = workOrigin;
      } else {
        const err = `Erreur Gemini ${chat.status}: ${chat.error || 'inconnue'}`;
        await persistStep({ type: 'llm', label: 'error', payload: err, status: 'failed' });
        return { reply: err, provider: 'gemini', model: workModel, steps, plan: null };
      }
    }

    if (workProvider === 'ollama' && !rawReply) {
      const res = await fetch(`${workOrigin}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: workModel,
          stream: false,
          messages: currentMessages,
          tools: ollamaTools.length > 0 ? ollamaTools : undefined,
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (!res.ok) {
        const err = `Erreur Ollama HTTP ${res.status}`;
        await persistStep({ type: 'llm', label: 'error', payload: err, status: 'failed' });
        return { reply: err, provider: 'ollama', model: workModel, steps, plan: null };
      }

      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      const msg = (data.message as Record<string, unknown> | undefined) ?? undefined;
      rawReply = typeof msg?.content === 'string' ? String(msg.content).trim() : '';
      const ollamaCalls = Array.isArray(msg?.tool_calls) ? (msg!.tool_calls as OllamaToolCall[]) : [];
      nativeToolCalls = ollamaCalls.map((tc, idx) => ({
        id: tc.id || `call_${turnId || 'turn'}_${turn}_${idx}`,
        type: 'function' as const,
        function: {
          name: tc.function?.name,
          arguments: tc.function?.arguments,
        },
      }));
      model = workModel;
      provider = 'ollama';
      origin = workOrigin;
    }

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
        const toolCallId = nativeCall.id;

        if (!tool) {
          currentMessages.push({
            role: 'tool',
            content: `[ERROR] Outil "${toolName}" non disponible pour ${input.agentId}.`,
            tool_call_id: toolCallId,
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
          content: formatToolResultForModel(tool, args, toolResult),
          tool_call_id: toolCallId,
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
        currentMessages.push({ role: 'tool', content: formatToolResultForModel(tool, args, toolResult) });
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
      const legacyTool = toolsByName.get(String(inlineTool.tool || ''));
      currentMessages.push({
        role: 'tool',
        content: formatToolResultForModel(
          legacyTool,
          coerceArguments(inlineTool as unknown),
          toolResult,
        ),
      });
      continue;
    }

    finalReply = afterPlan;
    await persistStep({
      type: 'llm',
      label: provider === 'gemini' ? 'gemini_chat' : 'ollama_chat',
      payload: 'ok',
      status: 'completed',
    });
    break;
  }

  return {
    reply: finalReply || 'Réponse vide.',
    provider,
    model,
    steps,
    toolResult: lastToolResult,
    plan: finalPlan,
  };
}
