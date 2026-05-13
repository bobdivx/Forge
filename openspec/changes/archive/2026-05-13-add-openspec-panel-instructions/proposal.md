# Proposal : panneau OpenSpec sur la page Instructions

## Intent

Rendre le flux OpenSpec du dépôt **découvrable depuis l’interface Forge**, au même endroit où l’on gère les prompts agents (`/agents/instructions`), afin d’aligner la documentation outillage (Cursor `/opsx:*`) avec le travail quotidien sans ouvrir uniquement le dépôt en CLI.

## Scope

- Ajouter sur `/agents/instructions` un encart (carte) **lisible et non intrusif** : rôle d’OpenSpec, chemins `openspec/specs/` et `openspec/changes/`, liens vers [openspec.dev](https://openspec.dev) et rappel des commandes slash utiles dans Cursor.
- Pas d’exécution du CLI OpenSpec côté serveur pour cette itération (pas de `openspec list` via API).

## Non-goals

- Édition des fichiers OpenSpec depuis le navigateur.
- Intégration CI ou validation automatique des changes.
- Internationalisation complète de l’encart (français suffit pour l’instant, cohérent avec le reste de la page).

## Success criteria

- Un utilisateur consultant « Instructions » voit l’encart et comprend où vivent les specs et comment démarrer une proposition (`/opsx:propose`).
- Aucune régression sur le chargement de `AgentInstructionEditor`.

## Risks / notes

- En déploiement, le dossier `openspec/` peut être absent selon le pipeline ; l’encart reste informatif (liens externes + conventions) et ne dépend pas de la présence des fichiers sur le serveur.
