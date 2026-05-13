# Design : GitHub Agent Dashboard

## Approach

### Daemon

- Singleton via `globalThis.__forgeGithubWatcher` pour survivre aux HMR Astro.
- API publique : `startGithubWatcher()`, `stopGithubWatcher()`, `runGithubWatcherNow()`, `getGithubWatcherStatus()`.
- Boucle :
  1. Liste `Project` actifs.
  2. Pour chaque projet → résout `owner/repo` (lecture remote git).
  3. Appel `ghListPullRequests` (forge-github-api.ts).
  4. Pour chaque PR sans décision récente (≤ 24h), appel LLM EXPERT_GITHUB avec contexte.
  5. Persist décision dans `GithubWatchDecision`.
  6. Si décision `useful`, crée `Request` (status pending) liée au projet ; si `duplicate`/`already_done`, commente la PR.

### LLM

Phase 4 MVP : pas d'appel LLM réel — on insère une décision **heuristique** basée sur les labels GitHub et le titre de la PR (dependabot, doc-only, etc.). Le hook LLM est prêt mais désactivable via une feature flag pour éviter les coûts pendant le développement initial.

## Files touched

- **Nouveaux** : `src/lib/forge-github-watcher.ts`, `src/pages/agents/github.astro`, `src/components/agents/github/GithubAgentBoard.tsx`, `src/components/agents/github/PRWatchPanel.tsx`, `src/components/agents/github/IssueTriagePanel.tsx`, `src/pages/api/agents/github/{status,run-now,reanalyze}.ts`, `openspec/specs/forge-github-agent/spec.md`.
- **Modifiés** : `db/config.ts` (ajout `GithubWatchDecision`), `src/lib/config-db.ts` (2 clés).

## Testing

- Unit : décisions heuristiques pour PR Dependabot, PR title contenant "fix typo", etc.
- Manuel : créer une PR de test, observer la décision dans le dashboard.
