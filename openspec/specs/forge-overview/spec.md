# forge-overview

## Purpose

Vue d’ensemble du dépôt Forge : socle applicatif et points d’extension pour les agents.

## Requirements

### Requirement: Stack et UI

Le système SHALL être une application Astro avec des îlots interactifs en Preact (intégration `@astrojs/preact`), styles Tailwind et daisyUI.

#### Scenario: Composant interactif

- GIVEN une page ou un layout Astro
- WHEN un comportement client est requis
- THEN utiliser un composant Preact (pas React) et les patterns existants du dépôt

### Requirement: Spécifications OpenSpec

Le système SHALL maintenir les exigences fonctionnelles pertinentes sous `openspec/specs/`, et les évolutions SHALL transiter par `openspec/changes/<id>/` (proposal, design, tasks, deltas) avant implémentation notable.

#### Scenario: Nouvelle capacité

- GIVEN une fonctionnalité qui modifie le comportement attendu du produit
- WHEN la conception n’est pas triviale
- THEN créer ou mettre à jour une proposition OpenSpec et les deltas associés, puis implémenter en suivant `tasks.md`

### Requirement: Contexte agents

Le système SHALL exposer instructions, doctrine et outils aux agents via la base (AgentInstruction, politique) et le code dans `src/lib/` ; les changements qui touchent ce comportement SHALL rester alignés avec les specs OpenSpec du domaine concerné.

#### Scenario: Modification du protocole agent

- GIVEN un changement de prompt, d’outils ou de règles globales
- WHEN le comportement attendu des agents change
- THEN documenter l’intent dans une spec ou un delta OpenSpec correspondant
