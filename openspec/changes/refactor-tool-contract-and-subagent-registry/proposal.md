# Proposal : Tool contract + Subagent registry

## Intent

Aligner Forge sur les patterns matures vus dans `claude-code` (contrat `Tool` uniforme avec défauts fail-closed) et `openclaw` (subagent registry persistant). Renforce la sécurité (classification destructive/read-only standardisée) et la traçabilité des sous-agents.

## Scope

- Ajouter un helper `buildTool` dans `forge-tool-contract.ts` qui applique des défauts sécurisés (`isDestructive: true` par défaut quand non spécifié, `isReadOnly: false`, `isConcurrencySafe: false`) — utilisable pour les nouveaux outils.
- Étendre `BuiltinToolDefinition` avec champs optionnels : `isReadOnly`, `isDestructive`, `isConcurrencySafe`, `runtimeProfile` (`coordinator` | `worker` | `both`).
- Annoter les outils builtin existants avec ces flags.
- Introduire `src/lib/forge-subagent-registry.ts` : run-id, parent-id, statut, log, annulation, persistance dans nouvelle table `SubagentRun`.
- Brancher `spawn_subagent` (`forge-swarm-tools.ts`) sur le registry pour qu'un run soit créé et son cycle de vie suivi.
- Lever `@ts-nocheck` sur `forge-swarm-tools.ts` après typage strict.

## Non-goals

- Réécriture du QueryEngine — l'orchestrateur reste inchangé.
- Migration MCP — les outils restent natifs.

## Success criteria

- Tout outil builtin annoté avec les flags de classification.
- Le permission engine consulte `isDestructive` / `isReadOnly` du tool (au lieu de pure heuristique) en priorité.
- Un sous-agent spawn via `spawn_subagent` crée une ligne `SubagentRun` (status `pending`) que l'on peut requêter via API.
- `forge-swarm-tools.ts` compile sans `@ts-nocheck`.
