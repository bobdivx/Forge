# Proposal : Dashboards Veille Tech & Bug Inspector

## Intent

Donner deux statuts dédiés (et leur daemon) pour :
- **Veille tech** : propose des améliorations / mises à jour / nouvelles fonctionnalités à partir de dépendances obsolètes, advisories GitHub, et (à terme) flux RSS.
- **Bug Inspector** : étend le bug detector existant pour inspecter les logs, les pages de santé, et les CI failures, et créer des `Request` quand un incident est bloquant.

## Scope

### Veille tech

- Daemon `src/lib/forge-tech-watch.ts` (singleton globalThis) :
  - Boucle (toutes les `Config.techWatchIntervalMinutes`, défaut 360 min = 6h).
  - Pour chaque projet : lit `package.json`, exécute `npm outdated` (ou pnpm/yarn équivalent) + `npm audit --json` sur le path du projet.
  - Stocke les propositions dans nouvelle table `TechWatchSuggestion` (provider `heuristic` pour MVP).
  - Crée une `Request` (`requestType = Fonctionnalite`) quand l'impact estimé est high.
- Page `src/pages/agents/veille.astro` + composant `VeilleTechBoard.tsx` (Preact).
- Endpoints `GET /api/agents/veille/status`, `POST /api/agents/veille/run-now`.

### Bug Inspector

- Page `src/pages/agents/bugs.astro` + composant `BugInspectorBoard.tsx` (Preact).
- Endpoints `GET /api/agents/bugs/status`, `POST /api/agents/bugs/run-now`.
- Extension légère du `forge-bug-detector` existant : exposer un `getBugDetectorStatus()` et un `runBugDetectorNow()` publics.

## Non-goals

- Flux RSS / Hacker News intégration — Phase ultérieure (le hook est prêt côté `Config.techWatchFeeds`).
- Auto-merge des PR Dependabot — c'est l'agent GitHub qui gère.

## Success criteria

- Pour un projet avec `package.json` contenant des deps obsolètes, le daemon insère ≥ 1 ligne dans `TechWatchSuggestion`.
- Le dashboard `/agents/veille` affiche ces suggestions avec impact estimé et lien vers le carnet.
- Le dashboard `/agents/bugs` affiche les dernières AgentAppIssue triées par criticité et permet de re-scanner manuellement.
