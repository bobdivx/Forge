/**
 * Sélectionne un modèle adéquat parmi les modèles Ollama disponibles,
 * en se basant sur le rôle inféré de l'agent (id / name / modèle initial).
 *
 * Ordre de préférence :
 *   1. Si le modèle courant est dispo → le garder.
 *   2. Modèle spécialisé selon le rôle (coder / vision / embed).
 *   3. `fallbackHint` (modèle global Auto/agentDefaultModel) s'il est dispo.
 *   4. Modèle généraliste connu (qwen, llama, mistral, gemma, phi).
 *   5. Premier modèle disponible.
 *   6. `null` si la liste est vide.
 */
export type AgentModelHint = {
  id?: string | null;
  name?: string | null;
  model?: string | null;
  role?: string | null;
};

const includesAny = (haystack: string, keywords: string[]): boolean =>
  keywords.some((k) => haystack.includes(k));

const findFirstMatch = (models: string[], keywords: string[]): string | undefined =>
  models.find((m) => includesAny(m.toLowerCase(), keywords));

export function pickAdequateModel(
  agent: AgentModelHint,
  availableModels: readonly string[],
  fallbackHint?: string | null,
): string | null {
  const models = Array.from(new Set(availableModels.filter((m) => typeof m === 'string' && m.trim())));
  if (models.length === 0) return null;

  const currentModel = String(agent.model || '').trim();
  if (currentModel && models.includes(currentModel)) return currentModel;

  const haystack = `${String(agent.id || '').toLowerCase()} ${String(agent.name || '').toLowerCase()} ${String(agent.role || '').toLowerCase()}`;

  const isCodeRole = /code|coder|dev|front|back|infra|script|github|build/.test(haystack);
  const isVisionRole = /vision|image|design/.test(haystack);
  const isEmbedRole = /embed|search|index/.test(haystack);
  const isReasoningRole = /analyste|analyst|architect|orchestr|chef|prompt|maitre|maître|veille|raison|reason/.test(haystack);

  if (isCodeRole) {
    const coder = findFirstMatch(models, ['coder', 'codellama', 'deepseek-coder']);
    if (coder) return coder;
  }
  if (isVisionRole) {
    const vision = findFirstMatch(models, ['vision', 'llava', 'minicpm-v']);
    if (vision) return vision;
  }
  if (isEmbedRole) {
    const embed = findFirstMatch(models, ['embed']);
    if (embed) return embed;
  }
  if (isReasoningRole) {
    const reasoning = findFirstMatch(models, ['deepseek-r1', 'qwen3', 'qwen2.5:32b', 'qwen2.5:14b', 'mixtral']);
    if (reasoning) return reasoning;
  }

  const hint = String(fallbackHint || '').trim();
  if (hint && hint !== 'Auto' && models.includes(hint)) return hint;

  const general = findFirstMatch(models, ['qwen2.5:7b', 'qwen', 'llama3', 'llama', 'mistral', 'gemma', 'phi']);
  if (general) return general;

  return models[0] ?? null;
}
