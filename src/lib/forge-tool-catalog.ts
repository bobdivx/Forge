/**
 * Catalogue des outils Forge.
 *
 * Source de vérité :
 *  - Code (ce fichier) : définitions des outils builtin (prêts à l'emploi).
 *  - DB (table AgentTool) : copie matérialisée + outils custom ajoutés via l'UI ou
 *    par les agents eux-mêmes (request_tool).
 *
 * Le seeder `ensureBuiltinToolsSeeded()` est idempotent : il upsert chaque définition
 * builtin par `name` et n'écrase rien d'autre.
 */
import { eq, and } from 'drizzle-orm';
import { loadAstroDb } from './load-astro-db';

export type ToolImplementationKind = 'builtin' | 'exec_template' | 'http';

export type ToolParametersSchema = {
  type: 'object';
  properties: Record<string, { type: string; description?: string; enum?: unknown[] }>;
  required?: string[];
};

export type BuiltinToolDefinition = {
  name: string;
  displayName: string;
  description: string;
  category: 'filesystem' | 'git' | 'github' | 'shell' | 'forge' | 'network';
  parameters: ToolParametersSchema;
  implementationKind: ToolImplementationKind;
  implementationConfig: Record<string, unknown>;
  requiresApproval?: boolean;
};

/**
 * 13 outils builtin prêts à l'emploi.
 *
 * Variables de templating disponibles dans `command` / `cwd` :
 *  - {{__projectPath}}  : chemin absolu du projet courant (résolu via projectId)
 *  - {{__projectName}}  : nom du projet
 *  - {{__githubToken}}  : jeton GitHub (Config.githubToken)
 *  - {{__branch}}       : branche de dev du projet
 *  - {{__repoOwner}}    : owner GitHub (parsé depuis remote)
 *  - {{__repoName}}     : nom du repo GitHub
 *  - {{argName}}        : argument fourni par le LLM (ex: {{path}}, {{message}})
 */
export const BUILTIN_TOOLS: BuiltinToolDefinition[] = [
  // ── Filesystem ────────────────────────────────────────────────────────────
  {
    name: 'read_file',
    displayName: 'Lire un fichier',
    description:
      "Lit le contenu d'un fichier du projet courant. À utiliser AVANT de répondre à toute question sur le code existant.",
    category: 'filesystem',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Chemin relatif (ex: src/pages/index.astro)' },
      },
      required: ['path'],
    },
    implementationKind: 'builtin',
    implementationConfig: { handler: 'read_file' },
  },
  {
    name: 'write_file',
    displayName: 'Écrire un fichier',
    description: 'Écrit (ou écrase) un fichier avec le contenu fourni.',
    category: 'filesystem',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Chemin relatif du fichier' },
        content: { type: 'string', description: 'Contenu complet à écrire' },
      },
      required: ['path', 'content'],
    },
    implementationKind: 'builtin',
    implementationConfig: { handler: 'write_file' },
  },

  // ── Shell ─────────────────────────────────────────────────────────────────
  {
    name: 'exec',
    displayName: 'Commande shell',
    description:
      "Exécute une commande shell arbitraire sur l'infra Forge. Utilise les outils git/gh dédiés quand ils existent.",
    category: 'shell',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'Commande shell complète' },
      },
      required: ['command'],
    },
    implementationKind: 'builtin',
    implementationConfig: { handler: 'exec' },
  },

  // ── Forge ────────────────────────────────────────────────────────────────
  {
    name: 'update_request_status',
    displayName: 'Mettre à jour une demande',
    description: "Met à jour le statut d'une tâche/demande dans la base Forge.",
    category: 'forge',
    parameters: {
      type: 'object',
      properties: {
        requestId: { type: 'integer', description: 'Identifiant numérique de la demande' },
        status: { type: 'string', enum: ['pending', 'in_progress', 'completed', 'rejected'] },
      },
      required: ['requestId', 'status'],
    },
    implementationKind: 'builtin',
    implementationConfig: { handler: 'update_request_status' },
  },
  {
    name: 'restart_gateway',
    displayName: 'Redémarrer la passerelle',
    description: 'Redémarre la passerelle Forge ou un conteneur Docker spécifique.',
    category: 'forge',
    parameters: {
      type: 'object',
      properties: {
        containerName: { type: 'string', description: 'Nom du conteneur (optionnel)' },
      },
    },
    implementationKind: 'builtin',
    implementationConfig: { handler: 'restart_gateway' },
  },
  {
    name: 'request_tool',
    displayName: 'Demander un outil',
    description:
      "Permet à l'agent de proposer l'installation d'un nouvel outil (commande shell). L'outil est immédiatement créé et auto-assigné à l'agent.",
    category: 'forge',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Nom technique unique (snake_case, ex: docker_logs)' },
        displayName: { type: 'string', description: 'Libellé affiché' },
        description: { type: 'string', description: 'Ce que fait l\'outil (lu par les LLM)' },
        commandTemplate: {
          type: 'string',
          description:
            'Template de commande, ex: "docker logs --tail {{lines}} {{container}}". Variables {{__projectPath}}, {{__githubToken}} disponibles.',
        },
        category: {
          type: 'string',
          description: 'Catégorie',
          enum: ['filesystem', 'git', 'github', 'shell', 'forge', 'network', 'custom'],
        },
        parameters: {
          type: 'string',
          description:
            'JSON Schema des paramètres acceptés (ex: \'{"type":"object","properties":{"container":{"type":"string"}},"required":["container"]}\').',
        },
      },
      required: ['name', 'commandTemplate'],
    },
    implementationKind: 'builtin',
    implementationConfig: { handler: 'request_tool' },
  },

  // ── Git ──────────────────────────────────────────────────────────────────
  {
    name: 'git_status',
    displayName: 'git status',
    description:
      "État du dépôt git : fichiers modifiés, non suivis, branche courante. À appeler AVANT toute question 'faut-il pousser ?'.",
    category: 'git',
    parameters: { type: 'object', properties: {} },
    implementationKind: 'exec_template',
    implementationConfig: {
      command: 'cd "{{__projectPath}}" && git status --short --branch',
      timeoutMs: 15000,
    },
  },
  {
    name: 'git_diff',
    displayName: 'git diff',
    description:
      "Diff des modifications non commitées. Utilise `path` pour cibler un fichier, `staged: true` pour le diff de l'index.",
    category: 'git',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Chemin relatif optionnel' },
        staged: { type: 'boolean', description: 'true = diff de l\'index uniquement' },
      },
    },
    implementationKind: 'exec_template',
    implementationConfig: {
      command: 'cd "{{__projectPath}}" && git diff --stat {{?staged|--cached}} -- {{path|}}',
      timeoutMs: 20000,
    },
  },
  {
    name: 'git_log',
    displayName: 'git log',
    description: 'Derniers commits du dépôt courant (par défaut 10).',
    category: 'git',
    parameters: {
      type: 'object',
      properties: {
        limit: { type: 'integer', description: 'Nombre de commits (défaut 10)' },
      },
    },
    implementationKind: 'exec_template',
    implementationConfig: {
      command:
        'cd "{{__projectPath}}" && git log -n {{limit|10}} --pretty=format:"%h %ad %an %s" --date=short',
      timeoutMs: 15000,
    },
  },
  {
    name: 'git_branch',
    displayName: 'git branch',
    description: 'Liste des branches locales et indication de la branche active.',
    category: 'git',
    parameters: { type: 'object', properties: {} },
    implementationKind: 'exec_template',
    implementationConfig: {
      command: 'cd "{{__projectPath}}" && git branch -vv',
      timeoutMs: 10000,
    },
  },
  {
    name: 'git_push',
    displayName: 'git push',
    description:
      "Pousse les commits locaux. ATTENTION : action irréversible. Utilise APRÈS git_status / git_diff. Le paramètre branch est optionnel (défaut : branche dev du projet).",
    category: 'git',
    parameters: {
      type: 'object',
      properties: {
        branch: { type: 'string', description: 'Branche à pousser (défaut : dev configurée)' },
      },
    },
    implementationKind: 'exec_template',
    implementationConfig: {
      command: 'cd "{{__projectPath}}" && git push origin {{branch|{{__branch}}}}',
      timeoutMs: 60000,
    },
  },

  // ── GitHub (gh CLI) ───────────────────────────────────────────────────────
  {
    name: 'gh_pr_list',
    displayName: 'PRs ouvertes',
    description: 'Liste les Pull Requests ouvertes du dépôt courant.',
    category: 'github',
    parameters: {
      type: 'object',
      properties: {
        state: { type: 'string', description: 'open | closed | merged | all', enum: ['open', 'closed', 'merged', 'all'] },
      },
    },
    implementationKind: 'exec_template',
    implementationConfig: {
      command:
        'cd "{{__projectPath}}" && GH_TOKEN={{__githubToken}} gh pr list --state {{state|open}} --json number,title,author,headRefName',
      timeoutMs: 20000,
    },
  },
  {
    name: 'gh_pr_view',
    displayName: 'Voir une PR',
    description: 'Affiche le détail d\'une Pull Request (description, commits, fichiers changés).',
    category: 'github',
    parameters: {
      type: 'object',
      properties: {
        number: { type: 'integer', description: 'Numéro de la PR' },
      },
      required: ['number'],
    },
    implementationKind: 'exec_template',
    implementationConfig: {
      command:
        'cd "{{__projectPath}}" && GH_TOKEN={{__githubToken}} gh pr view {{number}} --json number,title,body,state,author,files',
      timeoutMs: 20000,
    },
  },
  {
    name: 'gh_pr_create',
    displayName: 'Créer une PR',
    description: "Crée une Pull Request depuis la branche courante vers la branche cible (défaut : main).",
    category: 'github',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Titre de la PR' },
        body: { type: 'string', description: 'Description (markdown)' },
        base: { type: 'string', description: 'Branche cible (défaut: main)' },
      },
      required: ['title'],
    },
    implementationKind: 'exec_template',
    implementationConfig: {
      command:
        'cd "{{__projectPath}}" && GH_TOKEN={{__githubToken}} gh pr create --title "{{title}}" --body "{{body|}}" --base {{base|main}}',
      timeoutMs: 30000,
    },
  },
];

export const DEFAULT_AGENT_ACTION_DOCTRINE = `DOCTRINE D'ACTION (impérative) :
- Tu es un AGENT, pas un consultant. AGIS d'abord, EXPLIQUE ensuite.
- Pour toute question portant sur l'état réel d'un système (fichiers, dépôt git, conteneurs, base, PR…), tu DOIS appeler l'outil approprié AVANT de formuler ta réponse. Réponse interdite sans observation.
- Exemples typiques :
  * "Faut-il pousser ?" → git_status puis git_diff puis tu décides.
  * "Que contient ce fichier ?" → read_file(path) puis tu réponds.
  * "Y a-t-il des PR ouvertes ?" → gh_pr_list puis tu listes.
- Ne donne JAMAIS de checklist générique ("vérifier les tests, faire un code review…") sans avoir d'abord vérifié toi-même via les outils.
- Si tu identifies un besoin récurrent qui n'est pas couvert par les outils existants, propose-le via l'outil request_tool : il sera immédiatement disponible.`;

let _seedingPromise: Promise<void> | null = null;

/**
 * Seed idempotent : insère/met à jour les outils builtin et la doctrine par défaut.
 * Coalescé sur globalThis pour éviter les double-seeds en dev.
 */
export async function ensureBuiltinToolsSeeded(): Promise<void> {
  if (_seedingPromise) return _seedingPromise;
  _seedingPromise = (async () => {
    const { db, AgentTool, AgentToolAssignment, AgentInstruction, Config } = await loadAstroDb();
    const now = new Date();

    // 1. Doctrine d'action (Config) - upsert
    try {
      const existing = await db.select().from(Config).where(eq(Config.key, 'agentActionDoctrine'));
      if (existing.length === 0) {
        await db.insert(Config).values({
          key: 'agentActionDoctrine',
          value: DEFAULT_AGENT_ACTION_DOCTRINE,
          updatedAt: now,
        });
      }
    } catch (e) {
      console.warn('[tool-catalog] doctrine seed failed:', e);
    }

    // 2. Outils builtin - upsert par name
    const seededIds: number[] = [];
    for (const def of BUILTIN_TOOLS) {
      try {
        const existing = await db.select().from(AgentTool).where(eq(AgentTool.name, def.name));
        if (existing.length === 0) {
          const inserted = await db
            .insert(AgentTool)
            .values({
              name: def.name,
              displayName: def.displayName,
              description: def.description,
              category: def.category,
              parametersJson: JSON.stringify(def.parameters),
              implementationKind: def.implementationKind,
              implementationConfig: JSON.stringify(def.implementationConfig),
              enabled: 1,
              builtin: 1,
              requiresApproval: def.requiresApproval ? 1 : 0,
              createdAt: now,
              updatedAt: now,
            })
            .returning({ id: AgentTool.id });
          if (inserted[0]?.id != null) seededIds.push(inserted[0].id);
        } else {
          // Met à jour la définition (description, schema…) sans toucher à enabled.
          await db
            .update(AgentTool)
            .set({
              displayName: def.displayName,
              description: def.description,
              category: def.category,
              parametersJson: JSON.stringify(def.parameters),
              implementationKind: def.implementationKind,
              implementationConfig: JSON.stringify(def.implementationConfig),
              builtin: 1,
              requiresApproval: def.requiresApproval ? 1 : 0,
              updatedAt: now,
            })
            .where(eq(AgentTool.name, def.name));
          seededIds.push(existing[0].id);
        }
      } catch (e) {
        console.warn(`[tool-catalog] seed of "${def.name}" failed:`, e);
      }
    }

    // 3. Auto-assigne tous les outils builtin à tous les agents existants (source=default).
    try {
      const agents = await db.select().from(AgentInstruction);
      for (const agent of agents) {
        for (const toolId of seededIds) {
          const existing = await db
            .select()
            .from(AgentToolAssignment)
            .where(and(eq(AgentToolAssignment.agentId, agent.agentId), eq(AgentToolAssignment.toolId, toolId)));
          if (existing.length === 0) {
            await db.insert(AgentToolAssignment).values({
              agentId: agent.agentId,
              toolId,
              enabled: 1,
              source: 'default',
              createdAt: now,
            });
          }
        }
      }
    } catch (e) {
      console.warn('[tool-catalog] auto-assign failed:', e);
    }
  })().catch((e) => {
    console.error('[tool-catalog] seeding error:', e);
    _seedingPromise = null;
  });
  return _seedingPromise;
}

export type EffectiveTool = {
  id: number;
  name: string;
  displayName: string;
  description: string;
  category: string;
  parameters: ToolParametersSchema;
  implementationKind: ToolImplementationKind;
  implementationConfig: Record<string, unknown>;
  builtin: boolean;
  requiresApproval: boolean;
};

/**
 * Retourne la liste des outils effectivement disponibles pour un agent donné.
 * Filtre :
 *  - AgentTool.enabled = 1
 *  - AgentToolAssignment.enabled = 1 pour cet agent
 */
export async function getEffectiveToolsForAgent(agentId: string): Promise<EffectiveTool[]> {
  await ensureBuiltinToolsSeeded();
  const { db, AgentTool, AgentToolAssignment } = await loadAstroDb();
  const assignments = await db
    .select()
    .from(AgentToolAssignment)
    .where(and(eq(AgentToolAssignment.agentId, agentId), eq(AgentToolAssignment.enabled, 1)));
  if (assignments.length === 0) return [];
  const toolIds = assignments.map((a) => a.toolId);
  const tools = await db.select().from(AgentTool);
  type AgentToolRow = (typeof tools)[number];
  const byId = new Map<number, AgentToolRow>(tools.map((t) => [t.id, t] as [number, AgentToolRow]));
  const out: EffectiveTool[] = [];
  for (const id of toolIds) {
    const t = byId.get(id);
    if (!t || Number(t.enabled) !== 1) continue;
    let params: ToolParametersSchema;
    try {
      params = JSON.parse(t.parametersJson) as ToolParametersSchema;
    } catch {
      params = { type: 'object', properties: {} };
    }
    let cfg: Record<string, unknown>;
    try {
      cfg = JSON.parse(t.implementationConfig) as Record<string, unknown>;
    } catch {
      cfg = {};
    }
    out.push({
      id: t.id,
      name: t.name,
      displayName: t.displayName,
      description: t.description,
      category: t.category,
      parameters: params,
      implementationKind: t.implementationKind as ToolImplementationKind,
      implementationConfig: cfg,
      builtin: Number(t.builtin) === 1,
      requiresApproval: Number(t.requiresApproval) === 1,
    });
  }
  return out;
}
