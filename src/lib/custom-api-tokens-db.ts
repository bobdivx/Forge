/**
 * Jetons API personnalisés (table CustomApiToken).
 */
import { eq, desc } from 'drizzle-orm';
import { loadAstroDb } from './load-astro-db';
import { isGithubAutomationAgent } from './agent-github-auth';

export type CustomTokenItemInput = {
  id?: number;
  key: string;
  label?: string;
  /** Vide = conserver le secret existant (mise à jour). */
  secret?: string;
};

/** Normalise une clé : MAJUSCULES, [A-Z0-9_], max 64. */
export function normalizeTokenKey(raw: string): string {
  let s = String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (!s) throw new Error('Clé vide ou invalide');
  if (!/^[A-Z]/.test(s)) s = `K_${s}`;
  return s.slice(0, 64);
}

export async function listCustomTokensForUi(): Promise<
  { id: number; key: string; label: string; hasSecret: boolean }[]
> {
  const { db, CustomApiToken } = await loadAstroDb();
  const rows = await db.select().from(CustomApiToken).orderBy(desc(CustomApiToken.updatedAt));
  return rows.map((r) => ({
    id: r.id,
    key: r.key,
    label: r.label ?? '',
    hasSecret: Boolean(r.secret && String(r.secret).length > 0),
  }));
}

/**
 * Synchronise la liste complète : supprime les IDs absents du payload,
 * met à jour / insère le reste.
 */
export async function syncCustomTokensFromClient(items: CustomTokenItemInput[]): Promise<void> {
  /** Ignore les lignes « nouvelles » vides ; les lignes avec id sont toujours traitées. */
  const cleaned = items.filter((i) => {
    if (typeof i.id === 'number') return true;
    const k = String(i.key || '').trim();
    const s = String(i.secret || '').trim();
    return Boolean(k && s);
  });

  const { db, CustomApiToken } = await loadAstroDb();
  const now = new Date();
  const withId = cleaned.filter((i): i is CustomTokenItemInput & { id: number } => typeof i.id === 'number');
  const keptIds = new Set(withId.map((i) => i.id));

  const all = await db.select().from(CustomApiToken);
  for (const row of all) {
    if (!keptIds.has(row.id)) {
      await db.delete(CustomApiToken).where(eq(CustomApiToken.id, row.id));
    }
  }

  const keysSeen = new Set<string>();

  for (const item of cleaned) {
    if (typeof item.id === 'number' && !String(item.key || '').trim()) {
      throw new Error('Chaque jeton enregistré doit avoir une clé.');
    }
    const key = normalizeTokenKey(item.key);
    if (keysSeen.has(key)) {
      throw new Error(`Clé dupliquée : ${key}`);
    }
    keysSeen.add(key);
    const label = String(item.label ?? '').trim();

    if (typeof item.id === 'number' && keptIds.has(item.id)) {
      const secretIn = String(item.secret ?? '').trim();
      if (secretIn) {
        await db
          .update(CustomApiToken)
          .set({ key, label: label || null, secret: secretIn, updatedAt: now })
          .where(eq(CustomApiToken.id, item.id));
      } else {
        await db
          .update(CustomApiToken)
          .set({ key, label: label || null, updatedAt: now })
          .where(eq(CustomApiToken.id, item.id));
      }
    } else if (item.id == null) {
      const secretIn = String(item.secret ?? '').trim();
      if (!secretIn) continue;
      await db.insert(CustomApiToken).values({
        key,
        label: label || null,
        secret: secretIn,
        createdAt: now,
        updatedAt: now,
      });
    }
  }
}

/** Bundle pour les agents (réseau local) : jetons Config + personnalisés. */
export async function getAgentApiSecretsBundle(agentId?: string): Promise<{
  /** URL dashboard Forge joignable depuis les agents (hooks / APIs). Vide si non renseigné — scripts utilisent encore env / défaut. */
  forgePublicUrl: string;
  githubToken: string;
  vercelToken: string;
  zimaosToken: string;
  custom: Record<string, string>;
}> {
  const { getAllConfig } = await import('./config-db');
  const config = await getAllConfig();
  const { db, CustomApiToken } = await loadAstroDb();
  const rows = await db.select().from(CustomApiToken);
  const custom: Record<string, string> = {};
  for (const r of rows) {
    if (r.key && r.secret) custom[r.key] = r.secret;
  }
  const githubAllowed = agentId ? isGithubAutomationAgent(agentId) : true;
  return {
    forgePublicUrl: config.forgePublicUrl || '',
    githubToken: githubAllowed ? config.githubToken || '' : '',
    vercelToken: config.vercelToken || '',
    zimaosToken: config.zimaosToken || '',
    custom,
  };
}
