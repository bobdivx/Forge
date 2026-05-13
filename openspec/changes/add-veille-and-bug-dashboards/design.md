# Design

## Tech Watch

- Polling `npm outdated --json` (peut prendre 30 s) + `npm audit --json` (5 s).
- Estimation d'impact :
  - Critical / high severity (audit) → impact `high`.
  - Major version bump (outdated) → impact `medium`.
  - Minor / patch → impact `low`.
- Persistance : `TechWatchSuggestion` (projectId, kind=outdated|advisory, package, current, latest, impact, justification).
- Dédoublonnage : skip si suggestion identique vue < 24 h.

## Bug Inspector

- Réutilise le bug detector existant (déjà en setInterval 30 s) ; on ajoute juste des fonctions d'inspection publique pour le dashboard.
- Le dashboard montre les `AgentAppIssue` récentes, par statut.

## Files touched

- **Nouveaux** : `src/lib/forge-tech-watch.ts`, `src/pages/agents/veille.astro`, `src/pages/agents/bugs.astro`, `src/components/agents/veille/VeilleTechBoard.tsx`, `src/components/agents/bugs/BugInspectorBoard.tsx`, `src/pages/api/agents/veille/{status,run-now}.ts`, `src/pages/api/agents/bugs/{status,run-now}.ts`, delta spec.
- **Modifiés** : `db/config.ts` (table), `src/lib/config-db.ts` (clés), `src/lib/forge-bug-detector.ts` (exports), `src/middleware.ts` (hook).
