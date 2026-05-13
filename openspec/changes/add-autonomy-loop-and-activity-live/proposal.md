# Proposal : Boucle d'autonomie 24/7 + Activity Live SSE

## Intent

Permettre à Forge de fonctionner en **autonomie totale 24/7** par défaut, avec un panneau **Activity Live** sur la home qui montre en temps réel ce que font les agents (logs `ActivityLog` en SSE).

## Scope

- **Mode autonomie globale** : nouvelle clé `Config.autonomyMode = on | off | quiet_hours`.
- **Quiet hours** : nouvelle clé `Config.autonomyQuietHours = "22:00-07:00"` (optionnel).
- **Sub-daemons coordonnés** : un orchestrateur `src/lib/forge-autonomy-loop.ts` lance et supervise :
  - le scheduler de travail (`forge-work-scheduler`)
  - le bug detector (`forge-bug-detector`)
  - le watcher GitHub (`forge-github-watcher`)
  - la veille tech (`forge-tech-watch`)
  - le pull Mission Board (déjà branché dans le scheduler — on superpose un health-check).
- **Activity Live** :
  - Endpoint SSE `GET /api/forge-activity-stream` qui poll `ActivityLog` toutes les 2 s et stream les nouvelles entrées.
  - Composant Preact `ActivityLive.tsx` placé sur la home (`src/pages/index.astro`).
- **API autonomy** :
  - `GET /api/autonomy/status` (mode, quiet hours, sub-daemons santé).
  - `POST /api/autonomy/mode` (basculer on/off/quiet_hours).

## Non-goals

- Persistance long-terme du flux SSE (pas de DB de logs additionnelle).
- Authentification spécifique du SSE (réutilise la session courante).

## Success criteria

- Au boot, sans configuration, l'autonomy loop est `on` et tous les daemons sont vivants.
- Pendant les `quiet_hours`, le scheduler met en pause les nouveaux dispatch (les daemons d'analyse continuent).
- La home affiche un flux temps-réel des actions agents avec auto-scroll.
- L'utilisateur peut basculer l'autonomie via la home / settings sans redémarrer Forge.
