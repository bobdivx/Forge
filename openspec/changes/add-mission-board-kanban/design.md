# Design

## Backend

`src/lib/forge-mission-board.ts` exporte :

```ts
export type Swimlane = 'bugs' | 'features' | 'tech';
export type Column = 'backlog' | 'triaged' | 'in_progress' | 'review' | 'done';
export type MissionItem = {
  uid: string; // `${source}:${id}`
  source: 'request' | 'app_issue' | 'tech_suggestion';
  swimlane: Swimlane;
  column: Column;
  sourceId: number;
  title: string;
  summary: string | null;
  projectId: number | null;
  projectName: string | null;
  priority: 'low' | 'medium' | 'high' | 'critical' | null;
  assignee: string | null;
  createdAt: string;
  updatedAt: string;
};

export async function getMissionBoardOverview(): Promise<{ items: MissionItem[]; counts: Record<Column, number>; bySwimlane: Record<Swimlane, Record<Column, number>>; lastSync: string; }>;
export async function moveMissionItem(uid: string, target: Column): Promise<{ ok: boolean; error?: string }>;
export async function dismissMissionItem(uid: string): Promise<{ ok: boolean; error?: string }>;
export async function pullMissionBoardOnce(): Promise<{ ok: boolean; promoted: number }>;
```

Mapping :
- `Request` → swimlane = `bugs` si `requestType === 'Correction'`, sinon `features`. Colonne via `status` : `pending` (sans assignée) → `backlog`, `pending` (assignée) → `triaged`, `in_progress` → `in_progress`, `review` → `review`, autres → `done`.
- `AgentAppIssue` → swimlane `bugs`. Colonne via `status` croisé avec `AgentTask` linked.
- `TechWatchSuggestion` → swimlane `tech`. Colonne via `status` + `impact`.

## Scheduler

`pullMissionBoardOnce()` :
1. Liste les items `triaged`.
2. Pour chaque item (limite 5 par appel), crée un `AgentTask` si aucun n'existe, et marque l'item en `in_progress` (par exemple `Request.status = 'in_progress'`).
3. Audit dans `ActivityLog`.

## UI

- 5 colonnes en flex-row, 3 swimlanes en rows.
- Cartes compactes avec source (icône), titre, projet, priorité.
- Drag & drop entre colonnes (HTML5 drag) — change la colonne via `POST /api/mission-board/action {action:'move'}`.
