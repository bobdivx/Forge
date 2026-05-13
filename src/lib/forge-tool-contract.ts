/**
 * Contrat d'outil Forge enrichi — inspiré de `Tool.ts` (claude-code).
 *
 * Sert à classifier les outils pour le permission engine, le coordinateur,
 * et le scheduler. Les flags ont des **défauts fail-closed** :
 *   - `isReadOnly`         défaut `false`
 *   - `isDestructive`      défaut `true` (sauf si `isReadOnly === true`)
 *   - `isConcurrencySafe`  défaut `false`
 *   - `runtimeProfile`     défaut `'worker'`
 *
 * Les outils existants restent compatibles : tant qu'aucun champ
 * `classification` n'est fourni, on tombe sur l'heuristique préexistante
 * (cf. `inferIsDestructive` / `inferIsReadOnly` dans `forge-tool-bus.ts`).
 */
import type { BuiltinToolDefinition } from './forge-tool-catalog';

/** Profil runtime d'un outil. */
export type ToolRuntimeProfile =
  /** Outil réservé au coordinateur (spawn_subagent, send_message, create_task, plan_mode…). */
  | 'coordinator'
  /** Outil ouvert aux workers (read_file, write_file, exec, git_*, gh_*, docker_*…). */
  | 'worker'
  /** Outil utilisable des deux côtés (read_file, list, status…). */
  | 'both';

export type ToolClassification = {
  isReadOnly?: boolean;
  isDestructive?: boolean;
  isConcurrencySafe?: boolean;
  runtimeProfile?: ToolRuntimeProfile;
};

export type ResolvedToolClassification = Required<ToolClassification>;

/**
 * Résout une classification partielle avec les défauts fail-closed.
 */
export function resolveClassification(raw?: ToolClassification | null): ResolvedToolClassification {
  const c = raw ?? {};
  const isReadOnly = c.isReadOnly === true;
  const isDestructive = c.isDestructive === false ? false : !isReadOnly;
  const isConcurrencySafe = c.isConcurrencySafe === true;
  const runtimeProfile: ToolRuntimeProfile = c.runtimeProfile ?? 'worker';
  return { isReadOnly, isDestructive, isConcurrencySafe, runtimeProfile };
}

/**
 * Helper de construction d'un outil builtin avec classification.
 *
 * Usage :
 * ```ts
 * export const fsRead = buildTool({
 *   name: 'fs_read',
 *   displayName: 'Lire un fichier',
 *   description: '...',
 *   category: 'filesystem',
 *   parameters: { ... },
 *   implementationKind: 'builtin',
 *   implementationConfig: { handler: 'fs_read' },
 *   classification: { isReadOnly: true, isConcurrencySafe: true, runtimeProfile: 'both' },
 * });
 * ```
 */
export function buildTool(
  def: Omit<BuiltinToolDefinition, 'implementationConfig'> & {
    implementationConfig?: Record<string, unknown>;
    classification?: ToolClassification;
  },
): BuiltinToolDefinition {
  const classification = resolveClassification(def.classification);
  const implementationConfig: Record<string, unknown> = {
    ...(def.implementationConfig ?? {}),
    classification,
  };
  return {
    name: def.name,
    displayName: def.displayName,
    description: def.description,
    category: def.category,
    parameters: def.parameters,
    implementationKind: def.implementationKind,
    implementationConfig,
    requiresApproval: def.requiresApproval,
  };
}

/**
 * Outils strictement réservés au coordinateur (rôles CHEF_TECHNIQUE,
 * ARCHITECTE_LOGICIEL). Le worker ne voit pas ces outils dans son catalogue.
 */
export const COORDINATOR_ONLY_TOOLS: string[] = [
  'spawn_subagent',
  'delegate_task',
  'send_message',
  'create_task',
  'enter_plan_mode',
  'exit_plan_mode',
];

/**
 * Outils que les workers peuvent appeler. Tout outil non listé dans
 * `COORDINATOR_ONLY_TOOLS` est worker-visible par défaut.
 */
export function isWorkerVisible(toolName: string): boolean {
  return !COORDINATOR_ONLY_TOOLS.includes(toolName);
}

export function isCoordinatorTool(toolName: string): boolean {
  return COORDINATOR_ONLY_TOOLS.includes(toolName);
}
