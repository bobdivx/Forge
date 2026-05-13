# Tasks — refactor-tool-contract-and-subagent-registry

## 1. Tool contract

- [x] 1.1 Créer `src/lib/forge-tool-contract.ts` avec types + `buildTool`.
- [x] 1.2 Étendre `BuiltinToolDefinition` et `EffectiveTool` pour porter les flags.
- [x] 1.3 Annoter les outils builtin existants (read_file, git_*, docker_ps/logs, gh_pr_list/view en read-only ; write_file, exec, git_push, git_commit, delete_path, gh_pr_create en destructifs).
- [x] 1.4 Modifier `executeDynamicTool` pour passer les flags explicites au permission engine.

## 2. Subagent registry

- [x] 2.1 Ajouter table `SubagentRun` dans `db/config.ts`.
- [x] 2.2 Créer `src/lib/forge-subagent-registry.ts` (start/run/complete/fail/cancel/get/list/countActive).
- [x] 2.3 Brancher `spawnSubagent` sur le registry (retourne `{ agentId, runId }`).
- [x] 2.4 Route API `src/pages/api/subagent-runs.ts` (GET liste/id, DELETE cancel).

## 3. Nettoyage typage

- [ ] 3.1 Lever `@ts-nocheck` sur `forge-swarm-tools.ts` et `forge-tools.ts` (deferred — corrections de typage massives, dans une change ultérieure).

## 4. Tests & docs

- [x] 4.1 Test unitaire `tests/unit/forge-subagent-registry.test.ts` (3 cas).
- [x] 4.2 Delta spec dans `specs/forge-tooling/spec.md`.
- [ ] 4.3 (Post-merge) Archiver.
