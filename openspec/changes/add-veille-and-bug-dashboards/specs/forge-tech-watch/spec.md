# Delta — forge-tech-watch

## ADDED Requirements

### Requirement: Daemon veille tech

Forge SHALL exécuter un daemon `forge-tech-watch` qui, à intervalle configurable (défaut 6 heures), scanne les dépendances obsolètes et les advisories sécurité pour chaque projet actif et stocke les résultats dans `TechWatchSuggestion`.

#### Scenario: Dépendance obsolète détectée

- GIVEN un projet contenant un `package.json` avec une dépendance obsolète (majeure)
- WHEN le daemon exécute son cycle
- THEN une ligne `TechWatchSuggestion(kind=outdated, impact=medium)` est créée pour cette dépendance
- AND si l'impact est `high`, une `Request` est insérée dans le carnet

#### Scenario: Vulnérabilité critique détectée

- GIVEN un projet avec une vulnérabilité de sévérité `critical` (npm audit)
- WHEN le daemon exécute son cycle
- THEN une `TechWatchSuggestion(kind=advisory, impact=critical)` est créée
- AND une `Request` de type `Correction` priorité `high` est insérée

### Requirement: Dashboard veille tech

La route `/agents/veille` SHALL afficher un tableau de bord Preact temps réel avec :
- Le statut du daemon (running/idle, intervalle, dernier scan).
- Une liste filtrable des suggestions (par impact, par statut).
- Un bouton « Lancer un scan maintenant ».

### Requirement: Dashboard Bug Inspector

La route `/agents/bugs` SHALL afficher un tableau de bord Preact qui :
- Affiche le statut du daemon `forge-bug-detector` (intervalle, dernier scan, bugs détectés).
- Liste les `AgentAppIssue` récentes avec filtre par statut.
- Permet de forcer un scan immédiat via `POST /api/agents/bugs/run-now`.

### Requirement: Endpoints API associés

Forge SHALL exposer :
- `GET /api/agents/veille/status`
- `POST /api/agents/veille/run-now`
- `GET /api/agents/bugs/status`
- `POST /api/agents/bugs/run-now`

Chaque endpoint retourne un JSON `{ status, recent }` ou `{ ok, ... }` selon le verbe.
