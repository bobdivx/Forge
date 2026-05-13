# Delta — forge-tooling (catalogue étendu)

## ADDED Requirements

### Requirement: Installation de paquets cross-OS

Forge SHALL exposer un outil `install_tool` qui détecte le gestionnaire de paquets approprié selon l'hôte (`winget`, `scoop`, `apt`, `apk`, `brew`, `npm`, `pip`, `cargo`) et installe le paquet demandé en mode non-interactif.

#### Scenario: Refus d'un nom non sûr

- GIVEN un agent invoque `install_tool({ pkg: "; rm -rf /" })`
- WHEN la validation du nom s'exécute
- THEN le résultat est `{ ok: false, error: "Nom de paquet invalide ou non sûr." }`
- AND aucune commande shell n'est exécutée

#### Scenario: Choix automatique du gestionnaire

- GIVEN le host context est `local_windows`
- WHEN un agent invoque `install_tool({ pkg: "jq" })` sans préciser `manager`
- THEN la commande générée utilise `winget`

### Requirement: Filesystem étendu

Forge SHALL fournir `fs_mkdir`, `fs_delete`, `fs_chmod`, et `fs_search` (ripgrep ou grep fallback), tous exposés via le toolbus avec classification appropriée.

#### Scenario: fs_search prefer ripgrep

- GIVEN ripgrep est installé sur le PATH
- WHEN un agent invoque `fs_search({ pattern: "TODO" })`
- THEN la commande utilise `rg` plutôt que `grep`

### Requirement: Docker complet via toolbus

Forge SHALL exposer au moins les 16 outils Docker suivants : `docker_container_create/start/stop/restart/remove/exec/logs_tail`, `docker_image_pull/build/list`, `docker_compose_up/down`, `docker_volume_list/remove`, `docker_network_list`, `docker_info`.

#### Scenario: Cycle de vie d'un conteneur

- GIVEN Docker est accessible (`canAccessDockerLocally()`)
- WHEN un agent enchaîne `docker_container_create` → `docker_container_logs_tail` → `docker_container_remove`
- THEN chaque appel retourne `ok=true` avec la sortie correspondante

### Requirement: GitHub API native

Forge SHALL exposer au moins les outils GitHub suivants via l'API REST (sans dépendance gh CLI) : `gh_api` (générique), `gh_pr_list_api`, `gh_pr_get`, `gh_pr_merge`, `gh_pr_close`, `gh_pr_review`, `gh_pr_comment`, `gh_issue_list`, `gh_issue_create`, `gh_issue_close`, `gh_issue_comment`, `gh_issue_label`, `gh_workflow_runs`, `gh_workflow_cancel`, `gh_workflow_rerun`, `gh_dependabot_alerts`, `gh_security_advisories`, `gh_branches_list`, `gh_release_create`.

#### Scenario: Appel API sans token

- GIVEN `Config.githubToken` est vide
- WHEN un agent invoque `gh_pr_list_api`
- THEN la réponse est `ok=false` avec un message indiquant l'absence de jeton

#### Scenario: Erreur HTTP propagée

- GIVEN un endpoint inexistant
- WHEN un agent appelle `gh_api({ endpoint: "/repos/foo/bar/does-not-exist" })`
- THEN le résultat porte `exitCode = 404` et `error` reflète le message GitHub
