# SKILL : CREATE_NEW_APP

## Declencheur
`Chef, cree une application [TYPE] appelee [NOM]`

## Workflow
1. `shell_execute("mkdir -p media/Github/NOM")`
2. Invoquer `ARCHITECTE_LOGICIEL` : `Definit la structure de fichiers pour une app [TYPE].`
3. Invoquer `DEV_BACKEND` et `DEV_FRONTEND` : `Genere les fichiers de base (main, package.json, etc.).`
4. Invoquer `EXPERT_GITHUB` : `Cree le repo distant et push le premier commit.`
5. Rapport final a l'utilisateur via Telegram.

## Regle Astro
Si la stack cible est Astro, generer des composants Preact uniquement.
