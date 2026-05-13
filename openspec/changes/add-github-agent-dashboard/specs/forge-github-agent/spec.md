# Delta — forge-github-agent

## ADDED Requirements

### Requirement: Daemon watcher GitHub

Forge SHALL exécuter un daemon `forge-github-watcher` qui interroge périodiquement (intervalle configurable, défaut 10 min) les PR ouvertes de tous les projets actifs et classe chaque PR en `useful | duplicate | already_done | needs_more_info | ignored`.

#### Scenario: Première analyse d'une PR

- GIVEN un projet actif lié à un repo GitHub
- WHEN une PR est ouverte sur ce repo
- THEN au prochain cycle, une ligne `GithubWatchDecision` est créée avec une décision et une justification
- AND si la décision est `useful`, une `Request` (status pending) est insérée

#### Scenario: Idempotence 24h

- GIVEN une PR déjà classée il y a moins de 24h
- WHEN un nouveau cycle s'exécute
- THEN aucune nouvelle décision n'est créée pour cette PR (sauf re-analyse forcée)

### Requirement: Dashboard Agent GitHub

La route `/agents/github` SHALL afficher un tableau de bord Preact temps réel avec :
- Le statut du daemon (running/idle, intervalle, dernier scan, prochain run).
- Un panneau listant les PR analysées récemment avec leur décision et leur justification.
- Un panneau « Issues entrantes » filtrable par projet.
- Un bouton « Lancer un scan maintenant ».

#### Scenario: Re-analyse manuelle

- GIVEN une décision affichée dans le dashboard
- WHEN l'utilisateur clique sur « Re-analyser »
- THEN l'endpoint `POST /api/agents/github/reanalyze` est appelé
- AND la décision est recalculée au prochain run (qui est déclenché immédiatement)

### Requirement: Endpoints API

Forge SHALL exposer :
- `GET /api/agents/github/status` — état du daemon + 50 dernières décisions.
- `POST /api/agents/github/run-now` — déclenche un cycle manuel.
- `POST /api/agents/github/reanalyze` — supprime la décision existante d'une PR et force un nouveau cycle.

#### Scenario: Démarrage automatique

- GIVEN `Config.githubWatcherEnabled = true`
- WHEN un middleware Astro est exécuté pour la première fois après le boot
- THEN le daemon est démarré (idempotent)
