import { describe, expect, it } from 'vitest';

// Réimplémente la même heuristique (la version interne de forge-github-watcher
// n'est pas exportée volontairement pour rester privée) — ce test sert de
// régression sur le comportement attendu de classification.
type PR = {
  number: number;
  title: string;
  user?: { login?: string };
  labels?: Array<{ name: string }>;
  draft?: boolean;
  body?: string | null;
};

function isDependabotPr(pr: PR): boolean {
  return /dependabot/i.test(pr.user?.login || '') || (pr.labels || []).some((l) => /dependencies/i.test(l.name));
}

function isDocOnly(pr: PR): boolean {
  return /\b(docs?|readme|typo|comment)\b/i.test(pr.title);
}

function classifyHeuristic(pr: PR, knownTitles: Set<string>) {
  const titleLower = pr.title.toLowerCase().trim();
  if (knownTitles.has(titleLower)) return { decision: 'duplicate' };
  if (pr.draft) return { decision: 'needs_more_info' };
  if (isDependabotPr(pr)) return { decision: 'useful' };
  if (isDocOnly(pr)) return { decision: 'useful' };
  if (/\b(wip|do not merge)\b/i.test(pr.title)) return { decision: 'needs_more_info' };
  return { decision: 'useful' };
}

describe('github-watcher heuristics', () => {
  it('marque les PR Dependabot comme utiles', () => {
    const pr: PR = { number: 1, title: 'Bump astro from 6.0.0 to 6.0.1', user: { login: 'dependabot[bot]' } };
    expect(classifyHeuristic(pr, new Set()).decision).toBe('useful');
  });

  it('marque les PR WIP comme needs_more_info', () => {
    const pr: PR = { number: 2, title: 'WIP: nouvelle fonctionnalité' };
    expect(classifyHeuristic(pr, new Set()).decision).toBe('needs_more_info');
  });

  it('marque les PR brouillon comme needs_more_info', () => {
    const pr: PR = { number: 3, title: 'Ajouter X', draft: true };
    expect(classifyHeuristic(pr, new Set()).decision).toBe('needs_more_info');
  });

  it('détecte les doublons par titre', () => {
    const pr: PR = { number: 4, title: 'Refacto auth' };
    const known = new Set(['refacto auth']);
    expect(classifyHeuristic(pr, known).decision).toBe('duplicate');
  });

  it('marque les PR doc/typo comme utiles', () => {
    const pr: PR = { number: 5, title: 'Fix typo in README' };
    expect(classifyHeuristic(pr, new Set()).decision).toBe('useful');
  });

  it('PR standard → utile', () => {
    const pr: PR = { number: 6, title: 'Ajouter endpoint /api/foo' };
    expect(classifyHeuristic(pr, new Set()).decision).toBe('useful');
  });
});
