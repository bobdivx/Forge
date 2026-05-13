# Proposal : Host context + Permission Engine

## Intent

Donner à Forge un **modèle d'autonomie** sécurisé : détection automatique de l'hôte d'exécution (Windows local en dev, Linux NAS en prod) et **moteur de permissions** unifié (global via Settings + override par agent), inspiré de `useCanUseTool` (claude-code) et des allow/deny listes héritées (openclaw).

## Scope

- Nouveau module `src/lib/forge-host-context.ts` qui retourne `{ kind: 'local' | 'container' | 'remote_ssh', platform, isDocker, hasDockerSocket }`. Branché en tête de `forge-infra-client.ts` pour choisir le mode par défaut quand la config ne précise rien.
- Nouveau module `src/lib/forge-permission-engine.ts` qui décide `allow | deny | ask` pour un couple `(agentId, toolName, args)` en fonction :
  - Mode global (`autonomous | tiered | plan_first`) stocké dans `Config.permissionMode`
  - Allowlist / denylist global (`Config.permissionAllowedTools` / `permissionDeniedTools`)
  - Override par agent dans nouvelle table `AgentPermission`
  - **Liste noire système non négociable** (`rm -rf /`, `git push --force main|master`, scripts shell touchant secrets, `dd of=/dev`).
- Audit dans `ActivityLog` à chaque décision non-trivial (refus, escalade).
- UI Settings : nouvel onglet **Permissions** dans `SettingsForm.tsx` (`PermissionPanel.tsx` Preact).
- UI Agent : nouveau composant `AgentPermissionEditor.tsx` accessible depuis `agents.astro`.

## Non-goals

- Sandbox isolé par sous-agent (microVM, etc.) — hors scope.
- Hooks plug-and-play personnalisés par utilisateur — la liste noire est codée en dur pour MVP.

## Success criteria

- Le moteur retourne une décision déterministe en < 5 ms pour un appel d'outil normal.
- Les agents peuvent fonctionner en autonomie totale (`autonomous`) avec audit complet.
- Le mode `tiered` bloque les outils marqués `isDestructive` sans approbation.
- L'UI Settings et l'UI Agent permettent de modifier modes/allowlist/denylist sans redémarrage.

## Risks / notes

- Le détecteur d'hôte ne doit pas faire de syscall qui plante en SSR (utiliser `fs.existsSync` seulement et catcher).
- La mise à jour DB doit propager au runtime sans recharger Astro : on invalide un cache mémoire local de l'engine via `resetPermissionEngineCache()`.
