# Delta — forge-tooling

## ADDED Requirements

### Requirement: Contrat d'outil classifié

Chaque outil exposé aux agents SHALL pouvoir porter une classification résolue `{ isReadOnly, isDestructive, isConcurrencySafe, runtimeProfile }`, persistée à travers `implementationConfig.classification`, et utilisée en priorité par le moteur de permissions.

#### Scenario: Lecture seule explicite

- GIVEN un outil builtin `read_file` annoté `{ isReadOnly: true, isConcurrencySafe: true, runtimeProfile: 'both' }`
- WHEN un agent l'appelle en mode `tiered`
- THEN le moteur de permissions retourne `allow` (mode:tiered:read)

#### Scenario: Helper `buildTool`

- GIVEN un développeur ajoute un nouvel outil via `buildTool({ ... })` sans `classification`
- WHEN la définition est sérialisée
- THEN `classification.isDestructive` vaut `true` (fail-closed) et `runtimeProfile` vaut `'worker'`

### Requirement: Profils coordinateur / worker

Les outils SHALL être catégorisés par `runtimeProfile` (`coordinator | worker | both`). Les outils `spawn_subagent`, `delegate_task`, `send_message`, `create_task`, `enter_plan_mode`, `exit_plan_mode` SHALL rester invisibles aux workers.

#### Scenario: Catalogue worker

- GIVEN un agent worker `DEV_BACKEND__APP_FORGE`
- WHEN on construit son catalogue effectif
- THEN il ne contient pas `spawn_subagent` ni `delegate_task`

### Requirement: Registre durable des sous-agents

Forge SHALL maintenir une table `SubagentRun` qui enregistre chaque spawn de sous-agent avec son cycle de vie (pending → running → completed | failed | cancelled), parent, enfant, projet, raison, sortie, erreur, dates.

#### Scenario: Création d'un run

- GIVEN un appel à `spawn_subagent` réussi
- WHEN le sous-agent est provisionné
- THEN une ligne `SubagentRun` (`status = pending`) est insérée
- AND l'identifiant `runId` est inclus dans la sortie de l'outil

#### Scenario: API de consultation

- GIVEN au moins un `SubagentRun` en base
- WHEN on appelle `GET /api/subagent-runs?parent=CHEF_TECHNIQUE`
- THEN la réponse liste les runs du parent (tri descendant)
