# Proposal : Catalogue d'outils étendu

## Intent

Donner aux agents les capacités réelles pour fonctionner en autonomie sur les apps en dev : installer des outils selon l'OS, manipuler le filesystem complet, gérer Docker (cycle complet), gérer GitHub via API (au-delà de `gh` CLI).

## Scope

Nouveaux outils builtin (handlers TS dans `forge-tool-bus.ts`) :

- **`install_tool`** (déjà partiellement existant — étendu) — installe un paquet via le bon gestionnaire selon le host context (winget/scoop sur Windows, apt/apk dans le conteneur, brew sur macOS, npm/pip/cargo).
- **`fs_mkdir`**, **`fs_delete`**, **`fs_chmod`**, **`fs_search`** (glob + ripgrep wrapper).
- **Docker (15 nouveaux)** : `docker_container_create`, `docker_container_start`, `docker_container_stop`, `docker_container_restart`, `docker_container_remove`, `docker_container_exec`, `docker_container_logs_tail`, `docker_image_pull`, `docker_image_build`, `docker_image_list`, `docker_compose_up`, `docker_compose_down`, `docker_volume_list`, `docker_volume_remove`, `docker_network_list`.
- **GitHub API native (12 nouveaux)** : `gh_pr_review`, `gh_pr_merge`, `gh_pr_close`, `gh_pr_comment`, `gh_issue_list`, `gh_issue_create`, `gh_issue_comment`, `gh_issue_close`, `gh_issue_label`, `gh_workflow_run`, `gh_workflow_cancel`, `gh_dependabot_alerts`, `gh_security_advisories`, `gh_branch_create`, `gh_branch_delete`, `gh_release_create`.

Tous via le handler unifié `octokit_call` (un seul handler générique qui prend `{ endpoint, method, params }` et appelle l'API GitHub avec le token).

## Non-goals

- Implémenter chaque endpoint GitHub comme outil distinct figé — un `octokit_call` générique + alias humains suffit.
- Sandbox des exécutions docker — on délègue à Docker / l'hôte.

## Success criteria

- Un agent en mode autonome peut, sur Windows local, installer `ripgrep` via `install_tool({ name: 'ripgrep' })`.
- Un agent peut créer/démarrer/arrêter/supprimer un conteneur Docker via le toolbus.
- Un agent peut lister les PR ouvertes, en commenter, merger, créer une issue, lister les Dependabot alerts.
- Aucune commande système n'est exposée que les denylists système ne refuseraient pas via le permission engine.
