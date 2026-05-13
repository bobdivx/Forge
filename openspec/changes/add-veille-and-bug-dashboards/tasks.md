# Tasks — add-veille-and-bug-dashboards

## 1. Veille Tech daemon

- [x] 1.1 Ajouter table `TechWatchSuggestion`.
- [x] 1.2 Ajouter clés `Config` : `techWatchEnabled`, `techWatchIntervalMinutes`, `techWatchFeeds`.
- [x] 1.3 Créer `src/lib/forge-tech-watch.ts` (singleton globalThis).
- [x] 1.4 Implémenter scans `npm outdated` + `npm audit --json`.

## 2. Dashboard Veille

- [x] 2.1 `src/pages/agents/veille.astro`.
- [x] 2.2 `src/components/agents/veille/VeilleTechBoard.tsx`.
- [x] 2.3 Endpoints API `status` + `run-now`.

## 3. Bug Inspector

- [x] 3.1 Exporter `getBugDetectorStatus()` + `runBugDetectorNow()` depuis `forge-bug-detector.ts`.
- [x] 3.2 Endpoints API `src/pages/api/agents/bugs/{status,run-now}.ts`.
- [x] 3.3 `src/pages/agents/bugs.astro` + `BugInspectorBoard.tsx`.

## 4. Démarrage automatique

- [x] 4.1 Hook tech-watch dans middleware (au boot).

## 5. Tests & docs

- [x] 5.1 Tests d'heuristique d'impact.
- [x] 5.2 Delta spec `specs/forge-tech-watch/spec.md`.
- [ ] 5.3 (Post-merge) Archiver.
