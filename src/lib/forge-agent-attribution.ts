/**
 * Préfixes visibles dans les titres PR / corps / messages Git : traçabilité agent Forge (Ageton).
 * Appliqué côté serveur au moment de l'exécution des outils (les LLM peuvent encore formuler leur message ; Forge ajoute l'en-tête).
 */

const PREFIX_RE = /^\[\s*Ageton\s*·\s*/i;
const FORGE_BODY_SENTINEL = '_Pull request marquée par **Forge (Ageton)**';

export function attributionPrefix(agentId: string): string {
  const a = String(agentId || '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 140);
  return `[Ageton · ${a || 'agent'}]`;
}

export function forgePrTitleWasAttributed(title: string): boolean {
  return PREFIX_RE.test(String(title || '').trim());
}

/** Titre GitHub avec préfixe stable (tronqué sans couper aveugrement le préfixe). */
export function applyForgeAttributionPrTitle(agentId: string, title: string): string {
  const t = String(title || '').trim();
  if (!t) return `${attributionPrefix(agentId)} (sans titre)`.slice(0, 240);
  if (forgePrTitleWasAttributed(t)) return t.slice(0, 240);

  const p = attributionPrefix(agentId);
  const maxLen = 240;
  const budget = Math.max(0, maxLen - p.length - 1);
  const body = budget >= t.length ? t : `${t.slice(0, budget)}…`;
  return `${p} ${body}`.trimEnd();
}

/** Pied de corps marqué (Markdown léger), idempotent. */
export function applyForgeAttributionPrBody(agentId: string, body: string): string {
  const b = String(body || '').trimEnd();
  if (b.includes(FORGE_BODY_SENTINEL)) {
    return b.slice(0, 120_000);
  }
  const agentLine = `\n\n---\n${FORGE_BODY_SENTINEL} · agent **${String(agentId).trim() || '?'}**.`;
  return (b ? `${b}${agentLine}` : agentLine.trim()).slice(0, 120_000);
}

export function forgeCommitMessageWasAttributed(message: string): boolean {
  return PREFIX_RE.test(String(message || '').trim());
}

/** Sujet de commit : une ligne forte ; max raisonnable pour les UIs Git. */
export function applyForgeAttributionGitCommitMessage(agentId: string, message: string): string {
  const raw = String(message || '').trim();
  if (!raw) return `${attributionPrefix(agentId)}`.slice(0, 320);

  let firstLine = raw.split(/\r?\n/).map((x) => x.trim()).find(Boolean) || raw;

  firstLine = firstLine.replace(/^["']+|["']+$/g, '').trim();

  if (forgeCommitMessageWasAttributed(firstLine)) {
    const rest = raw.indexOf('\n') >= 0 ? raw.slice(raw.indexOf('\n')) : '';
    return (firstLine + rest).slice(0, 12_000);
  }

  const p = attributionPrefix(agentId);
  const maxSubject = 300;
  const budget = Math.max(20, maxSubject - p.length - 1);
  const condensed =
    firstLine.length <= budget ? firstLine : `${firstLine.slice(0, budget)}…`;
  let out = `${p} ${condensed}`.trim();

  const restMultilineIdx = raw.indexOf('\n');
  if (restMultilineIdx > 0) {
    out += raw.slice(restMultilineIdx);
  }

  return out.slice(0, 12_000);
}
