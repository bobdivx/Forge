# Tasks — add-autonomy-loop-and-activity-live

## 1. Config & orchestrateur

- [x] 1.1 Ajouter clés `Config` : `autonomyMode`, `autonomyQuietHours`.
- [x] 1.2 Créer `src/lib/forge-autonomy-loop.ts` (super-orchestrateur, singleton).
- [x] 1.3 Health-check périodique (10 min) qui relance un daemon mort.

## 2. Quiet hours

- [x] 2.1 Helper `isInQuietHours(now, range)` (HH:MM-HH:MM).
- [x] 2.2 Le scheduler vérifie `quiet_hours` via `shouldDispatchNow()` avant de dispatcher.

## 3. SSE Activity

- [x] 3.1 Endpoint `src/pages/api/forge-activity-stream.ts` (SSE).
- [x] 3.2 Composant `src/components/home/ActivityLive.tsx`.
- [x] 3.3 Intégrer `ActivityLive` dans `src/pages/dashboard.astro` (la home publique reste landing).

## 4. API autonomie

- [x] 4.1 `src/pages/api/autonomy/status.ts`.
- [x] 4.2 `src/pages/api/autonomy/mode.ts`.

## 5. Hook middleware & boot

- [x] 5.1 Remplacer les `start*` individuels du middleware par `startAutonomyLoop()`.

## 6. Tests & docs

- [x] 6.1 Tests `isInQuietHours`.
- [x] 6.2 Delta spec `specs/forge-autonomy/spec.md`.
- [ ] 6.3 (Post-merge) Archiver.
