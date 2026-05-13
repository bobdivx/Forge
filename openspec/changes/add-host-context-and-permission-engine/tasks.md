# Tasks — add-host-context-and-permission-engine

## 1. Host context

- [x] 1.1 Créer `src/lib/forge-host-context.ts` (`detectHostContext()`, `getHostContext()` cached).
- [x] 1.2 Brancher dans `forge-infra-client.ts` : si `zimaosAccessMode` est vide, choisir `local` en dev, `remote_ssh` si SSH config présente.

## 2. Permission engine

- [x] 2.1 Ajouter table `AgentPermission` dans `db/config.ts`.
- [x] 2.2 Ajouter clés `Config` : `permissionMode`, `permissionAllowedTools`, `permissionDeniedTools`.
- [x] 2.3 Créer `src/lib/forge-permission-engine.ts`.
- [x] 2.4 Inclure DENY_PATTERNS hardcodée.
- [x] 2.5 Brancher l'engine dans `executeDynamicTool` (`forge-tool-bus.ts`).

## 3. UI Settings

- [x] 3.1 Créer `src/components/settings/PermissionsTab.tsx`.
- [x] 3.2 Ajouter onglet "Permissions" dans `SettingsForm.tsx`.
- [x] 3.3 Ajouter route API `src/pages/api/permissions/global.ts`.

## 4. UI Agent

- [x] 4.1 Créer `src/components/agents/AgentPermissionEditor.tsx` (intégré dans `AgentConfigModal`).
- [x] 4.2 Ajouter route API `src/pages/api/permissions/agent/[agentId].ts`.

## 5. Tests & docs

- [x] 5.1 Tests unitaires `tests/unit/forge-permission-engine.test.ts` (8 cas).
- [x] 5.2 Spec delta dans `specs/forge-permissions/spec.md`.
- [ ] 5.3 (Post-merge) Archiver la change.
