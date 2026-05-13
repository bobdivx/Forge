# Design : Extended Tool Catalog

## Approach

### Install tool

Un seul handler `install_tool` qui détecte la plateforme via `getHostContext()` et choisit le bon gestionnaire de paquets :

- `local_windows` → winget (préféré), scoop (fallback), npm (-g pour outils JS)
- `container_linux` ou `local_linux` → apt-get / apk / npm / pip
- `local_macos` → brew, npm
- Toutes plateformes → npm (-g), pip, cargo si le paquet est explicitement de cet écosystème

Le paramètre `manager` permet de forcer le gestionnaire si besoin.

### Filesystem

Handlers TS purs qui passent par `getZimaOSInfraClient()` pour rester compatibles local/SSH.

### Docker

`forge-docker-ops.ts` expose un client unifié. Si `canAccessDockerLocally()`, utilise le socket via `docker-engine-socket.ts` (déjà existant). Sinon fallback sur la CLI `docker` exposée via l'infra client.

### GitHub

`forge-github-api.ts` fait des `fetch` directs vers `https://api.github.com` avec `Authorization: Bearer <token>`. Pas besoin de la lib Octokit (poids inutile).

Un handler `octokit_call` générique reçoit `{ endpoint, method, params }`. Les outils nommés (`gh_pr_merge`, `gh_issue_create`, etc.) sont des wrappers `exec_template` qui appellent `octokit_call` via `http_request` ou… non, plus simple : des builtins qui construisent l'appel.

**Décision finale** : un seul handler `gh_api` reçoit `{ endpoint, method, params }` et fait l'appel. Les outils nommés sont des shortcuts définis comme `exec_template` avec `command` vide et un champ `gh_api` dédié — mais c'est complexe. **On simplifie** : chaque outil nommé est un builtin avec son propre handler qui construit l'URL et délègue à un helper interne `forgeGithubFetch(endpoint, method, body)`.

## Files touched

- **Nouveaux** : `src/lib/forge-tool-install.ts`, `src/lib/forge-docker-ops.ts`, `src/lib/forge-github-api.ts`, tests.
- **Modifiés** : `src/lib/forge-tool-bus.ts` (ajout handlers), `src/lib/forge-tool-catalog.ts` (ajout définitions).

## Testing

- Unit : detection OS, parsing des sorties Docker, requêtes GitHub mockées.
- Manuel : lancer chaque catégorie via l'API REPL agent.
