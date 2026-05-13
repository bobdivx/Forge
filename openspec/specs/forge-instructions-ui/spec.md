# forge-instructions-ui

## Purpose

UI dédiée à la gestion des instructions agents (`/agents/instructions`), y compris l'aide contextuelle au flux OpenSpec du dépôt.

## Requirements

### Requirement: Panneau OpenSpec sur la page Instructions

La page `/agents/instructions` SHALL afficher un encart d'aide « OpenSpec » accessible sans navigation supplémentaire, afin que les personnes qui configurent les agents voient aussi le flux specifications-driven du dépôt.

#### Scenario: Encart visible

- GIVEN un utilisateur authentifié autorisé à voir la page Instructions
- WHEN il charge `/agents/instructions`
- THEN un bloc intitulé de façon explicite (OpenSpec ou équivalent) est visible
- AND il indique que les specs vivantes sont sous `openspec/specs/`
- AND il indique que les propositions de changement sont sous `openspec/changes/`

#### Scenario: Commandes Cursor

- GIVEN le même encart
- WHEN l'utilisateur lit le contenu
- THEN les commandes slash `/opsx:propose`, `/opsx:apply`, `/opsx:archive` et `/opsx:explore` sont mentionnées comme point d'entrée dans Cursor
- AND un lien vers la documentation publique OpenSpec (https://openspec.dev) est fourni

#### Scenario: Disclosure optionnel

- GIVEN l'encart
- WHEN l'utilisateur souhaite réduire la hauteur de page
- THEN le détail du texte d'aide peut être repliable (par ex. élément HTML disclosure natif) sans casser la mise en page

### Requirement: Cohérence visuelle

L'encart SHALL utiliser les mêmes conventions de carte / espacement que le reste de la page Instructions (fond clair, bordure légère, coins arrondis) pour ne pas introduire un style divergent.

#### Scenario: Lisibilité

- GIVEN une fenêtre étroite (mobile)
- WHEN la page est affichée
- THEN le texte et les extraits de chemins ne provoquent pas de débordement horizontal inutilisable (retour à la ligne ou scroll horizontal localisé sur `code`)
