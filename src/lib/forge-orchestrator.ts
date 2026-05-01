import { getOllamaOriginResolved } from './config-db';
import { buildAgentPolicyContext } from './agent-rules';

export type ForgeOrchestratorInput = {
  agentId: string;
  message: string;
  modelHint?: string;
  projectId?: number;
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

import { loadAstroDb } from './load-astro-db';

async function resolveAvailableModel(preferred: string): Promise<{ origin: string, model: string }> {
  const defaultOrigin = (await getOllamaOriginResolved()).replace(/\/$/, '');
  let instances: any[] = [];
  try {
    const { db, OllamaInstance, eq } = await loadAstroDb();
    if (OllamaInstance) {
      instances = await db.select().from(OllamaInstance).where(eq(OllamaInstance.enabled, 1));
    }
  } catch {}
  
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
      if (names.includes(preferred)) {
        return { origin, model: preferred };
      }
      if (names.length > 0) {
        allFound.push({ origin, models: names });
      }
    } catch {
      // ignore
    }
  }

  const fallbacks = ['qwen3-coder:30b', 'llama3.2:latest', 'qwen2.5:7b', 'gemma4:latest'];
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

  return { origin: defaultOrigin, model: preferred };
}

import { runForgeTool, type ForgeToolResult, type ForgeToolCall } from './forge-tool-bus';

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

export async function runForgeOrchestrator(input: ForgeOrchestratorInput): Promise<ForgeOrchestratorOutput & { plan?: ForgePlanItem[] | null }> {
  const steps: ForgeOrchestratorOutput['steps'] = [];
  const toolCall = parseInlineToolDirective(input.message);
  let toolResult: ForgeToolResult | undefined;

  if (toolCall) {
    const label = toolCall.tool === 'exec' ? `Commande: ${toolCall.command.slice(0, 40)}...` : `Tool: ${toolCall.tool}`;
    steps.push({ type: 'tool', label, payload: JSON.stringify(toolCall), status: 'running' });
    toolResult = await runForgeTool(toolCall);
    steps.push({
      type: 'tool',
      label: toolResult.ok ? 'Action terminée' : 'Échec de l\'action',
      payload: toolResult.ok ? 'ok' : toolResult.error || 'error',
      status: toolResult.ok ? 'completed' : 'failed',
    });
  }

  const preferredModel = String(input.modelHint || '').trim() || process.env.OLLAMA_MODEL?.trim() || 'llama3.2:latest';
  const { origin, model } = await resolveAvailableModel(preferredModel);

  const policy = await buildAgentPolicyContext(input.projectId, input.agentId);
  steps.push({
    type: 'policy',
    label: 'strict_mode',
    payload: policy.strictMode,
    status: policy.strictMode === 'off' ? 'completed' : 'running',
  });
  const content = toolResult?.ok
    ? `${input.message}\n\n[TOOL_RESULT]\n${String(toolResult.output || '').slice(0, 5000)}`
    : input.message;
  const systemContent = policy.instructionText;
  steps.push({ type: 'llm', label: 'ollama_chat', payload: model, status: 'running' });
  const res = await fetch(`${origin}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      stream: false,
      messages: [
        ...(systemContent ? [{ role: 'system', content: systemContent }] : []),
        { role: 'user', content },
      ],
    }),
    signal: AbortSignal.timeout(45_000),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok && res.status === 404) {
    const prompt = `${systemContent ? `${systemContent}\n\n` : ''}Agent: ${input.agentId}\n\n${content}`;
    const genRes = await fetch(`${origin}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        stream: false,
        prompt,
      }),
      signal: AbortSignal.timeout(45_000),
    });
    const genData = (await genRes.json().catch(() => ({}))) as Record<string, unknown>;
    if (genRes.ok) {
      const generated = typeof genData.response === 'string' ? genData.response.trim() : '';
      steps.push({ type: 'llm', label: 'ollama_generate_fallback', payload: 'ok', status: 'completed' });
      return {
        reply: generated || 'Réponse vide.',
        provider: 'ollama',
        model,
        steps,
        toolResult,
      };
    }
    if (genRes.status === 404) {
      const v1Res = await fetch(`${origin}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content }],
        }),
        signal: AbortSignal.timeout(45_000),
      });
      const v1Data = (await v1Res.json().catch(() => ({}))) as Record<string, unknown>;
      if (v1Res.ok) {
        const choices = Array.isArray(v1Data.choices) ? (v1Data.choices as Array<Record<string, unknown>>) : [];
        const text = typeof choices[0]?.message === 'object'
          ? String((choices[0].message as Record<string, unknown>).content || '').trim()
          : '';
        steps.push({ type: 'llm', label: 'openai_chat_fallback', payload: 'ok', status: 'completed' });
        return {
          reply: text || 'Réponse vide.',
          provider: 'ollama-openai',
          model,
          steps,
          toolResult,
        };
      }
      steps.push({
        type: 'llm',
        label: 'openai_chat_fallback',
        payload: `http_${v1Res.status}`,
        status: 'failed',
      });
    }
    steps.push({ type: 'llm', label: 'ollama_generate_fallback', payload: `http_${genRes.status}`, status: 'failed' });
  }
  if (!res.ok) {
    steps.push({ type: 'llm', label: 'ollama_chat', payload: `http_${res.status}`, status: 'failed' });
    return {
      reply: `Erreur Ollama HTTP ${res.status}`,
      provider: 'ollama',
      model,
      steps,
      toolResult,
    };
  }
  const rawReply =
    typeof (data.message as Record<string, unknown> | undefined)?.content === 'string'
      ? String((data.message as Record<string, unknown>).content).trim()
      : '';
  let { cleaned: reply, audit } = extractRuleAudit(rawReply);

  if (policy.strictMode === 'enforce' && (!audit || !audit.rules_ok)) {
    steps.push({ type: 'policy', label: 'strict_retry', payload: 'non_compliant_first_pass', status: 'running' });
    const retrySystem = `${systemContent}\n\nTu as retourne une reponse non conforme aux regles. Corrige et respecte strictement toutes les regles.`;
    const retryRes = await fetch(`${origin}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        stream: false,
        messages: [
          { role: 'system', content: retrySystem },
          { role: 'user', content },
        ],
      }),
      signal: AbortSignal.timeout(45_000),
    });
    const retryData = (await retryRes.json().catch(() => ({}))) as Record<string, unknown>;
    const retryRaw =
      typeof (retryData.message as Record<string, unknown> | undefined)?.content === 'string'
        ? String((retryData.message as Record<string, unknown>).content).trim()
        : '';
    const retryParsed = extractRuleAudit(retryRaw);
    reply = retryParsed.cleaned || reply;
    audit = retryParsed.audit;
    steps.push({
      type: 'policy',
      label: 'strict_retry',
      payload: audit?.rules_ok ? 'compliant' : 'still_non_compliant',
      status: audit?.rules_ok ? 'completed' : 'failed',
    });
  }

  if (policy.strictMode !== 'off') {
    steps.push({
      type: 'policy',
      label: 'strict_audit',
      payload: audit?.rules_ok ? 'compliant' : 'non_compliant',
      status: audit?.rules_ok ? 'completed' : 'failed',
    });
  }

  const { cleaned: finalReply, plan } = extractForgePlan(reply);
  steps.push({ type: 'llm', label: 'ollama_chat', payload: 'ok', status: 'completed' });
  if (plan) {
    steps.push({ type: 'system', label: 'plan_detected', payload: `${plan.length} tâches`, status: 'completed' });
  }
  return {
    reply: finalReply || 'Réponse vide.',
    provider: 'ollama',
    model,
    steps,
    toolResult,
    plan,
  };
}

