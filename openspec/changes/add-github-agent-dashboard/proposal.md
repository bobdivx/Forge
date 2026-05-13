# Proposal : Dashboard et daemon Agent GitHub

## Intent

Donner à Forge un agent dédié au **suivi GitHub** (PR ouvertes, issues entrantes, runs CI) avec dashboard live et analyse LLM des PR pour décider si elles sont utiles / doublon / déjà faites. Inspiré du flux `coordinator/` (claude-code) — un coordinateur surveille, classe et crée des tâches.

## Scope

- Nouveau daemon `src/lib/forge-github-watcher.ts` (singleton globalThis comme le scheduler) :
  - Boucle indépendante toutes les N minutes (configurable via nouvelle clé `Config.githubWatcherIntervalMinutes`, défaut 10).
  - Pour chaque projet enregistré + chaque PR ouverte, appel LLM `EXPERT_GITHUB` avec contexte (titre, diff résumé, état des Request existantes) → décision `useful | duplicate | already_done | needs_more_info` → crée une `Request` dans le board ou commente la PR.
  - Stockage des décisions dans nouvelle table `GithubWatchDecision` (audit + dédoublonnage).
- Dashboard Astro **`src/pages/agents/github.astro`** + composants Preact dans `src/components/agents/github/` :
  - `GithubAgentBoard.tsx` : statut live du daemon (running/idle/error, prochaines syncs, dernier scan), nombre de PR analysées.
  - `PRWatchPanel.tsx` : liste des PR ouvertes par projet avec leur dernière décision et bouton « re-analyser ».
  - `IssueTriagePanel.tsx` : liste des issues entrantes triées par criticité avec actions rapides.
- Endpoints API :
  - `GET /api/agents/github/status` : état du daemon, dernières décisions, métriques.
  - `POST /api/agents/github/run-now` : déclenche un cycle manuel.
  - `POST /api/agents/github/reanalyze` : force la re-analyse d'une PR donnée.

## Non-goals

- Auto-merge des PR — l'agent peut commenter/labelliser, jamais merger seul (à moins d'approbation explicite).
- Webhooks GitHub temps réel — la phase 4 utilise polling, les webhooks viendront plus tard.

## Success criteria

- Le daemon démarre automatiquement au boot d'Astro (si `Config.githubWatcherEnabled = true`).
- Une nouvelle PR ouverte sur un projet enregistré apparaît dans le dashboard < 15 min après son ouverture.
- Chaque PR a une décision LLM avec justification courte (≤ 500 caractères) stockée en DB.
- Le dashboard affiche un panneau live sans nécessiter de refresh manuel (auto-refresh 30 s côté Preact).
