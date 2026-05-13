# Tasks — add-github-agent-dashboard

## 1. Daemon & DB

- [x] 1.1 Table `GithubWatchDecision` dans `db/config.ts`.
- [x] 1.2 Clés `Config` : `githubWatcherEnabled`, `githubWatcherIntervalMinutes`, `githubWatcherAgentId`.
- [x] 1.3 `src/lib/forge-github-watcher.ts` (singleton globalThis).
- [x] 1.4 Classification heuristique (PR dependabot, doc-only, WIP, draft, doublons par titre).

## 2. Endpoints API

- [x] 2.1 `src/pages/api/agents/github/status.ts` (GET).
- [x] 2.2 `src/pages/api/agents/github/run-now.ts` (POST).
- [x] 2.3 `src/pages/api/agents/github/reanalyze.ts` (POST).

## 3. UI dashboard

- [x] 3.1 Page Astro `src/pages/agents/github.astro`.
- [x] 3.2 `GithubAgentBoard.tsx`.
- [x] 3.3 `PRWatchPanel.tsx`.
- [x] 3.4 `IssueTriagePanel.tsx`.

## 4. Démarrage automatique

- [x] 4.1 Hook dans `src/middleware.ts` (lance après bug detector et scheduler).

## 5. Tests & docs

- [x] 5.1 Tests heuristiques `tests/unit/forge-github-watcher.test.ts` (6 cas).
- [x] 5.2 Delta spec `specs/forge-github-agent/spec.md`.
- [ ] 5.3 (Post-merge) Archiver.
