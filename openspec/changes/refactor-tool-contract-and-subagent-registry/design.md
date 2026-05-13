# Design : Tool contract + Subagent registry

## Approach

### Tool contract

- `buildTool` est un helper léger qui n'enveloppe pas le runtime existant — il sert à **construire des `BuiltinToolDefinition` enrichies** avec défauts fail-closed pour les nouveaux outils (Phase 3+).
- Les flags de classification sont stockés à côté de `parametersJson` dans la DB via une colonne JSON `classificationJson` (option) ou intégrés au `implementationConfig.classification` pour ne pas migrer le schéma minimal (préférence : `implementationConfig.classification`).

### Subagent registry

- Inspiré de `subagent-registry.ts` d'openclaw : un ledger DB des runs, observable via API et UI plus tard.
- Hook minimal pour MVP : `spawn_subagent` crée un `SubagentRun(status='pending')` et retourne le `runId` en plus de l'`agentId`. Les transitions de statut viendront avec le scheduler (Phase 7).

## Files touched

- **Nouveaux** : `src/lib/forge-tool-contract.ts`, `src/lib/forge-subagent-registry.ts`, `src/pages/api/subagent-runs.ts`, `tests/unit/forge-subagent-registry.test.ts`, `openspec/specs/forge-tooling/spec.md`.
- **Modifiés** : `db/config.ts` (ajout `SubagentRun`), `src/lib/forge-tool-catalog.ts` (flags), `src/lib/forge-tool-bus.ts` (consommation flags), `src/lib/forge-swarm-tools.ts` (registry + retrait nocheck).

## Alternatives considered

| Option | Raison |
|--------|--------|
| Réécrire `ForgeTool` en `buildTool` strict (rupture API) | Trop gros chantier — tout `forge-tools.ts` à refactor. On garde compat et on ajoute le helper en parallèle. |
| Migrer une colonne dédiée dans `AgentTool` | Migration Astro DB lourde — on stocke les flags dans `implementationConfig.classification`. |

## Testing

- Unit : registry (`startRun` → `completeRun` → `getRun` retourne `completed`).
- Manuel : `spawn_subagent` retourne `{ agentId, runId }`.
