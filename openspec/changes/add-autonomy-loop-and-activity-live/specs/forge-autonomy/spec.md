# Delta — forge-autonomy

## ADDED Requirements

### Requirement: Autonomy loop 24/7

Forge SHALL exécuter une boucle d'autonomie globale `forge-autonomy-loop` qui supervise tous les sub-daemons (`forge-work-scheduler`, `forge-bug-detector`, `forge-github-watcher`, `forge-tech-watch`) selon trois modes :
- `on` — tout actif 24/7
- `off` — tout arrêté
- `quiet_hours` — daemons d'analyse actifs, mais dispatch du scheduler inhibé pendant la plage configurée

#### Scenario: Mode on au boot

- GIVEN `Config.autonomyMode = 'on'`
- WHEN le middleware appelle `startAutonomyLoop()`
- THEN tous les sub-daemons sont démarrés
- AND une entrée `autonomy.boot` est enregistrée dans `ActivityLog`

#### Scenario: Quiet hours actif

- GIVEN `Config.autonomyMode = 'quiet_hours'` et `Config.autonomyQuietHours = '22:00-07:00'`
- AND l'heure courante est 23h00
- WHEN le scheduler appelle `shouldDispatchNow()`
- THEN la fonction retourne `false`
- AND aucun nouveau dispatch ne se produit (les daemons d'analyse continuent)

### Requirement: API autonomy

Forge SHALL exposer :
- `GET /api/autonomy/status` — retourne mode, plage, santé des sub-daemons, bootedAt.
- `POST /api/autonomy/mode { mode }` — bascule le mode et persiste.

### Requirement: Activity Live SSE

Forge SHALL exposer `GET /api/forge-activity-stream` qui streame en SSE :
- un snapshot initial des 50 dernières entrées `ActivityLog`
- toute nouvelle entrée toutes les 2 secondes

#### Scenario: Reconnexion client

- GIVEN un client a perdu la connexion SSE
- WHEN il rouvre `/api/forge-activity-stream`
- THEN il reçoit à nouveau un snapshot initial puis le flux incrémental

### Requirement: Panneau Activity Live

La home du dashboard (`/dashboard`) SHALL afficher un panneau Preact `ActivityLive` qui :
- ouvre `/api/forge-activity-stream` via `EventSource`
- affiche les événements en console live (auto-scroll)
- montre l'état de santé des sub-daemons
- permet de basculer le mode d'autonomie (`on`/`off`/`quiet_hours`)

### Requirement: Health-check

`forge-autonomy-loop` SHALL exécuter un health-check toutes les 10 minutes qui redémarre tout sub-daemon mort si le mode courant l'exige.
