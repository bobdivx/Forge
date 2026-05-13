# Design : Host context + Permission engine

## Approach

### Host context

- Module pur : pas d'IO async ; détection synchrone basée sur `process.platform`, `process.env`, et `fs.existsSync('/var/run/docker.sock')`.
- Cache mémoire (singleton) — le contexte ne change pas pendant l'exécution.

### Permission engine

```ts
type PermissionMode = 'autonomous' | 'tiered' | 'plan_first';
type PermissionDecision = 'allow' | 'deny' | 'ask';

decidePermission({ agentId, toolName, args, isDestructive }) => {
  // 1. Hard deny patterns (jamais override)
  // 2. Override per-agent (AgentPermission) — allow/deny explicite
  // 3. Mode global :
  //    - autonomous : allow par défaut (sauf hard deny)
  //    - tiered : allow lecture, ask pour destructive, deny pour secrets externes
  //    - plan_first : ask sauf si déjà approuvé pour ce plan
}
```

- Cache mémoire des configs (`Config` row + `AgentPermission`) avec TTL 5 s pour ne pas requeter à chaque appel.

## Files touched

- **Nouveaux** : `src/lib/forge-host-context.ts`, `src/lib/forge-permission-engine.ts`, `src/components/settings/PermissionsTab.tsx`, `src/components/agents/AgentPermissionEditor.tsx`, `src/pages/api/permissions/global.ts`, `src/pages/api/permissions/agent/[agentId].ts`, `tests/unit/forge-permission-engine.test.ts`, `openspec/specs/forge-permissions/spec.md`.
- **Modifiés** : `db/config.ts` (ajout table), `src/lib/config-db.ts` (3 clés), `src/lib/forge-tool-bus.ts` (hook engine), `src/lib/forge-infra-client.ts` (utilise host context), `src/components/settings/SettingsForm.tsx` (onglet), `src/components/agents/AgentsGrid.tsx` (bouton).

## Alternatives considered

| Option | Reason |
|--------|--------|
| Réutiliser `requiresApproval` + `Approval` table | Insuffisant : pas d'override agent, pas de mode global, pas de hard-deny patterns. |
| MCP-style permission server externe | Sur-ingénierie pour MVP — le moteur reste in-process. |

## Testing

- Unit : matrice de décisions (3 modes × 3 types d'outils × override / pas override).
- Manuel : changer le mode dans `/settings`, lancer un agent, vérifier l'audit dans `ActivityLog`.
