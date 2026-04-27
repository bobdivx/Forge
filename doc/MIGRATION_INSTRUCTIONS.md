# Migration du dossier instructions vers doc

## Objectif

Réduire la dépendance runtime à `instructions/` en privilégiant :

1. les prompts stockés en base (`AgentInstruction.systemPrompt`),
2. les chemins markdown sous `doc/`,
3. un fallback legacy temporaire seulement si nécessaire.

## Etat appliqué

- Les chemins par défaut des agents Forge pointent désormais vers `doc/agents/*` et `doc/prompts/SOUL.md`.
- La lecture des prompts essaie d'abord `doc/`, puis un fallback vers `instructions/`.
- Les nouveaux agents créés via API utilisent `doc/agents/<AGENT_ID>.md`.
- Les sous-agents applicatifs utilisent `doc/agents/apps/<AGENT_ID>.md`.
- Les markdown non sensibles ont été copiés vers `doc/` pour centraliser la documentation.

## Reste volontairement conservé dans instructions

- `instructions/auth.json`
- `instructions/config.json`

Ces fichiers peuvent contenir des secrets ou des valeurs d'environnement historiques.
Ils restent en place tant que la migration complète des secrets n'est pas validée.

## Suppression finale (phase suivante)

1. Vérifier qu'aucune ligne `AgentInstruction.filePath` active ne pointe encore vers `instructions/`.
2. Migrer/archiver les secrets legacy (`auth.json`, `config.json`) vers la configuration DB/env.
3. Supprimer le dossier `instructions/` et son fallback dans le code.
