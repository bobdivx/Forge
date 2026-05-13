# Tasks — add-mission-board-kanban

## 1. Backend agrégation

- [x] 1.1 Créer `src/lib/forge-mission-board.ts` (agrégat + mapping état → colonne).
- [x] 1.2 Endpoint `src/pages/api/mission-board.ts`.
- [x] 1.3 Endpoint `src/pages/api/mission-board/action.ts`.

## 2. Pull autonome scheduler

- [x] 2.1 Étendre `forge-work-scheduler.ts` avec `pullMissionBoardOnce()` priorisant `triaged`.
- [x] 2.2 Hook dans la boucle existante (tous les 5 ticks).

## 3. UI

- [x] 3.1 Composant `src/components/mission-board/MissionBoard.tsx`.
- [x] 3.2 Sous-composants intégrés (cartes + colonnes).
- [x] 3.3 Page `src/pages/mission-board.astro`.

## 4. Tests & docs

- [x] 4.1 Tests unitaires du mapping état → colonne.
- [x] 4.2 Delta spec `specs/forge-mission-board/spec.md`.
- [ ] 4.3 (Post-merge) Archiver.
