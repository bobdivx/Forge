# Delta — forge-permissions

## ADDED Requirements

### Requirement: Moteur de permissions unifié

Forge SHALL exposer un moteur `decidePermission(ctx)` qui retourne `allow | deny | ask` pour tout appel d'outil d'agent, basé sur (a) un mode global (`autonomous | tiered | plan_first`), (b) des allowlists/denylists globales, (c) un override par agent (table `AgentPermission`), et (d) une liste de patterns dangereux non négociables.

#### Scenario: Mode autonome par défaut

- GIVEN aucun override agent et `permissionMode = autonomous`
- WHEN un agent appelle un outil non listé dans la denylist
- THEN le moteur retourne `allow` avec `ruleId = mode:autonomous`

#### Scenario: Hard deny non override

- GIVEN un agent en mode autonome
- WHEN il tente d'exécuter `rm -rf /`, `git push --force origin main`, `dd of=/dev/...`, `mkfs.*`, `shutdown`, fork bomb, `curl ... | sh`
- THEN le moteur retourne `deny` avec un `ruleId = hard_deny:*`
- AND la décision est journalisée dans `ActivityLog`

#### Scenario: Override par agent

- GIVEN une ligne `AgentPermission` pour l'agent X avec `deniedTools = ["docker_volume_remove"]`
- WHEN cet agent appelle `docker_volume_remove`
- THEN le moteur retourne `deny` avec `ruleId = agent_override:deny`

### Requirement: Auto-détection de l'hôte

Forge SHALL exposer `getHostContext()` qui retourne `{ kind, platform, isDocker, hasDockerSocket, defaultInfraMode }` sans IO async, mis en cache, et utilisé par `forge-infra-client` pour choisir un mode par défaut quand la config DB est vide.

#### Scenario: Auto-détection Windows local

- GIVEN aucun `zimaosAccessMode` enregistré et l'application tourne sur Windows
- WHEN `getZimaOSInfraConfig()` est appelé
- THEN le mode résolu est `local`

#### Scenario: Auto-détection conteneur Linux

- GIVEN `/.dockerenv` existe et `zimaosAccessMode` est vide
- WHEN `getZimaOSInfraConfig()` est appelé
- THEN le mode résolu reste `local` (le conteneur exécute Forge directement)

### Requirement: UI Settings — onglet Permissions

La page `/settings` SHALL afficher un onglet « Permissions » Preact qui permet de modifier le mode global, l'allowlist et la denylist, et qui affiche l'hôte détecté.

#### Scenario: Modification du mode

- GIVEN un utilisateur authentifié sur `/settings`
- WHEN il choisit le mode `tiered` et clique sur Enregistrer
- THEN `Config.permissionMode = tiered` est persisté
- AND le moteur invalide son cache et applique le nouveau mode au prochain appel

### Requirement: UI Agent — override par agent

Le modal de configuration d'un agent SHALL exposer un onglet « Permissions » qui édite la ligne `AgentPermission` de l'agent (mode hérité ou explicite, allowlist, denylist) avec bouton « Supprimer l'override ».

#### Scenario: Suppression d'un override

- GIVEN un agent X a une ligne `AgentPermission`
- WHEN l'utilisateur clique sur « Supprimer l'override » et confirme
- THEN la ligne est supprimée et l'agent hérite à nouveau du mode global
