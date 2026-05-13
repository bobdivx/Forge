# Tasks — add-extended-tool-catalog

## 1. Install_tool unifié

- [x] 1.1 Créer `src/lib/forge-tool-install.ts` (validation + dispatch).
- [x] 1.2 Détection OS via `getHostContext()`.
- [x] 1.3 Handler `install_tool` dans `forge-tool-bus.ts`.

## 2. Filesystem étendus

- [x] 2.1 Handlers `fs_mkdir`, `fs_delete`, `fs_chmod`.
- [x] 2.2 Handler `fs_search` (rg + grep fallback).
- [x] 2.3 Définitions dans `BUILTIN_TOOLS`.

## 3. Docker complet

- [x] 3.1 Créer `src/lib/forge-docker-ops.ts` (16 ops + sécurisation des noms).
- [x] 3.2 Handlers dans `forge-tool-bus.ts`.
- [x] 3.3 Définitions builtin (16 outils).

## 4. GitHub API natif

- [x] 4.1 Créer `src/lib/forge-github-api.ts` (fetch + token).
- [x] 4.2 Handler `gh_api` générique + alias dédiés.
- [x] 4.3 Définitions builtin (19 outils).

## 5. Tests & docs

- [x] 5.1 Tests unitaires `tests/unit/forge-tool-install.test.ts`.
- [x] 5.2 Delta spec `specs/forge-tooling/spec.md`.
- [ ] 5.3 (Post-merge) Archiver.
