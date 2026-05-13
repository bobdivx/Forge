# Proposal : Mission Board kanban généralisé

## Intent

Donner aux agents un **board partagé** unifié pour piocher leur travail, et à l'utilisateur une vue d'ensemble en lecture/écriture des trois sources de demandes :
- Bugs (depuis `AgentAppIssue` + `Request` correction)
- Features (depuis `Request` fonctionnalité/amélioration)
- Veille tech (depuis `TechWatchSuggestion` non encore convertie)

## Scope

- **Endpoint** `GET /api/mission-board` qui retourne `{ items, swimlanes, columns, lastSync }`.
- **Endpoint** `POST /api/mission-board/action` avec actions :
  - `move` (changer la colonne d'une item),
  - `pull_now` (déclencher une passe scheduler immédiate),
  - `dismiss` (marquer une suggestion comme `ignored`).
- **Composant Preact** `MissionBoard.tsx` :
  - **5 colonnes** : `backlog | triaged | in_progress | review | done`
  - **3 swimlanes** : `bugs | features | tech`
  - filtres : projet, priorité, source.
- **Page** `src/pages/mission-board.astro` (la page `/work` historique est préservée).
- **Pull autonome** : `forge-work-scheduler` SHALL piocher en priorité les items en colonne `triaged` (sinon `backlog`) et les déplacer en `in_progress` puis `review` quand un task est terminé.

## Mapping état → colonne

| Source                  | Champ état                     | backlog                     | triaged                       | in_progress      | review        | done                       |
|-------------------------|--------------------------------|-----------------------------|-------------------------------|------------------|---------------|----------------------------|
| `Request`               | `status`                       | `pending` sans assignée      | `pending` avec assignée       | `in_progress`    | `review`      | `done` / `cancelled`       |
| `AgentAppIssue`         | `status` + tâche liée          | `open` sans tâche           | `open` avec tâche `pending`   | task `running`   | `in_review`   | `resolved` / `wont_fix`    |
| `TechWatchSuggestion`   | `status`                       | `open` impact ≤ medium      | `open` impact ≥ high          | `converted_to_request` (et task en cours) | n/a | `dismissed`                |

## Non-goals

- Drag-and-drop multi-sources hors swimlane (Phase 7).
- Reporting historique 30j sur Mission Board (déjà dans `/work`).

## Success criteria

- L'agent VEILLE_TECH peut créer une suggestion `high` ; elle apparaît directement dans le swimlane `tech` → colonne `triaged`.
- Le scheduler crée un `AgentTask` pour les items `triaged` au prochain cycle, l'item bascule en `in_progress`.
- L'utilisateur peut visualiser et déplacer manuellement les items.
