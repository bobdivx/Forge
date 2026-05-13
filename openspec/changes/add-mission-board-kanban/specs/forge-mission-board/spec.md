# Delta — forge-mission-board

## ADDED Requirements

### Requirement: Vue unifiée Mission Board

Forge SHALL exposer une vue unifiée `Mission Board` agrégeant trois sources de travail (`Request`, `AgentAppIssue`, `TechWatchSuggestion`) classées en 5 colonnes (`backlog | triaged | in_progress | review | done`) et 3 swimlanes (`bugs | features | tech`).

#### Scenario: Suggestion veille tech à fort impact

- GIVEN une `TechWatchSuggestion(impact=high, status=open)`
- WHEN un client GET `/api/mission-board`
- THEN la réponse contient une `MissionItem(source=tech_suggestion, swimlane=tech, column=triaged)`

#### Scenario: AppIssue avec task running

- GIVEN un `AgentAppIssue(status=open)` lié à un `AgentTask(status=running)`
- WHEN un client GET `/api/mission-board`
- THEN la `MissionItem` correspondante est classée en `column=in_progress`

### Requirement: Mouvement manuel

L'utilisateur SHALL pouvoir déplacer une item entre colonnes via `POST /api/mission-board/action` avec `action=move`. Le mouvement met à jour le statut de la source sous-jacente (`Request.status`, `AgentAppIssue.status` ou `TechWatchSuggestion.status`).

### Requirement: Pull autonome

`forge-work-scheduler` SHALL, à intervalle régulier (au moins toutes les 5 minutes), promouvoir jusqu'à 5 items en colonne `triaged` vers `in_progress` en créant un `AgentTask` correspondant et en mettant à jour la source.

#### Scenario: Pull immédiat

- WHEN un client envoie `POST /api/mission-board/action { action: 'pull_now', maxPromote: 3 }`
- THEN jusqu'à 3 items `triaged` sont promus en `in_progress`
- AND `ActivityLog` enregistre une entrée `mission.pull` avec le nombre d'items promus
