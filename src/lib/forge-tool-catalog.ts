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
 * Outils builtin prêts à l'emploi (mode ACCÈS TOTAL — auto-assignés à tous les agents).
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
  {
    name: 'git_commit',
    displayName: 'git commit (Forge)',
    description:
      'Enregistre un commit Git dans le projet courant. À utiliser **à la place** de exec("git commit ...") pour que Forge préfixe le message **`[Ageton · IDENTIFIANT_AGENT]`** automatiquement. `git add …` doit déjà avoir été fait.',
    category: 'git',
    parameters: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          description: 'Sujet principal du commit (Forge ajoutera `[Ageton · …]` automatiquement).',
        },
        amend: {
          type: 'boolean',
          description: 'true = `--amend` (remplace le dernier commit, utile après oubli de fichier).',
        },
      },
      required: ['message'],
    },
    implementationKind: 'builtin',
    implementationConfig: { handler: 'git_commit' },
  },

  // ── Filesystem étendus ────────────────────────────────────────────────────
  {
    name: 'list_dir',
    displayName: 'Lister un répertoire',
    description: 'Liste le contenu d\'un répertoire (équivalent ls -la). Retourne les fichiers et sous-dossiers.',
    category: 'filesystem',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Chemin absolu ou relatif au projet (défaut: répertoire courant)' },
      },
    },
    implementationKind: 'exec_template',
    implementationConfig: {
      command: 'ls -la "{{path|{{__projectPath}}}}"',
      timeoutMs: 10000,
    },
  },
  {
    name: 'find_files',
    displayName: 'Rechercher des fichiers',
    description: 'Recherche des fichiers par nom ou contenu (find + grep). Idéal pour explorer un dépôt rapidement.',
    category: 'filesystem',
    parameters: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Pattern (glob ou regex). Ex: "*.ts" ou "TODO"' },
        mode: { type: 'string', enum: ['name', 'content'], description: 'name = par nom de fichier, content = grep dans les fichiers' },
        path: { type: 'string', description: 'Racine de recherche (défaut: projet courant)' },
      },
      required: ['pattern'],
    },
    implementationKind: 'exec_template',
    implementationConfig: {
      command:
        'cd "{{path|{{__projectPath}}}}" && if [ "{{mode|name}}" = "content" ]; then grep -rIn --exclude-dir=node_modules --exclude-dir=.git "{{pattern}}" . | head -200; else find . -name "{{pattern}}" -not -path "*/node_modules/*" -not -path "*/.git/*" | head -200; fi',
      timeoutMs: 30000,
    },
  },
  {
    name: 'delete_path',
    displayName: 'Supprimer un fichier ou dossier',
    description: 'Supprime un fichier ou un dossier. Action IRRÉVERSIBLE — utilise avec précaution. recursive=true pour supprimer un dossier non vide.',
    category: 'filesystem',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Chemin à supprimer' },
        recursive: { type: 'boolean', description: 'Suppression récursive (dossier non vide)' },
      },
      required: ['path'],
    },
    implementationKind: 'exec_template',
    implementationConfig: {
      command: 'rm {{?recursive|-rf}} -- "{{path}}"',
      timeoutMs: 30000,
    },
  },

  // ── Réseau / API ──────────────────────────────────────────────────────────
  {
    name: 'http_request',
    displayName: 'Requête HTTP',
    description:
      'Appelle une URL HTTP (GET / POST / PUT / DELETE). Sert à interroger l\'API Forge interne (http://localhost:4321/api/...) ou n\'importe quelle API externe.',
    category: 'network',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL complète' },
        method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'], description: 'Méthode HTTP (défaut GET)' },
        body: { type: 'string', description: 'Corps JSON (pour POST/PUT/PATCH)' },
        headers: { type: 'string', description: 'Headers JSON (ex: {"Authorization":"Bearer xxx"})' },
      },
      required: ['url'],
    },
    implementationKind: 'http',
    implementationConfig: {
      url: '{{url}}',
      method: '{{method|GET}}',
      body: '{{body|}}',
    },
  },

  // ── Docker ────────────────────────────────────────────────────────────────
  {
    name: 'docker_ps',
    displayName: 'Lister les conteneurs',
    description: 'Liste tous les conteneurs Docker (running et stopped) sur l\'hôte ZimaOS.',
    category: 'shell',
    parameters: {
      type: 'object',
      properties: {
        all: { type: 'boolean', description: 'Inclure les conteneurs arrêtés' },
      },
    },
    implementationKind: 'exec_template',
    implementationConfig: {
      // Note : `{{.Names}}` n'est pas matché par le templater (il exige \w+, pas `.`),
      // donc Docker reçoit bien sa propre syntaxe Go template.
      command: 'docker ps {{?all|-a}} --format "table {{.Names}}\\t{{.Status}}\\t{{.Image}}"',
      timeoutMs: 15000,
    },
  },
  {
    name: 'docker_logs',
    displayName: 'Logs Docker',
    description: 'Affiche les logs d\'un conteneur Docker (tail).',
    category: 'shell',
    parameters: {
      type: 'object',
      properties: {
        container: { type: 'string', description: 'Nom ou ID du conteneur' },
        lines: { type: 'integer', description: 'Nombre de lignes (défaut 100)' },
      },
      required: ['container'],
    },
    implementationKind: 'exec_template',
    implementationConfig: {
      command: 'docker logs --tail {{lines|100}} "{{container}}" 2>&1',
      timeoutMs: 20000,
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
    description:
      'Crée une Pull Request depuis la branche courante vers la branche cible (défaut : main). Forge **préfixe le titre et ajoute une ligne de pied** avec `Ageton` et l\'identité de **l\'agent Forge** automatiquement (traçabilité).',
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

ACCÈS TOTAL :
- Tu disposes d'un ACCÈS COMPLET à l'infrastructure Forge / ZimaOS / NAS. Aucun outil n'est gated, aucune approbation humaine n'est requise.
- Tu peux : lire et écrire n'importe quel fichier, exécuter n'importe quelle commande shell (exec), gérer Docker (docker_*), git (commits traçables **git_commit**, push, branches, merges), GitHub (PR, releases, secrets via gh CLI), appeler n'importe quelle API HTTP (http_request), redémarrer la gateway, créer toi-même de nouveaux outils (request_tool).
- Tu peux aussi piloter Forge en interne via son API REST. Méthode privilégiée : utilise l'outil dédié http_request (zéro dépendance). Si tu veux passer par exec, utilise wget (toujours présent dans le conteneur Alpine) car curl peut être absent :
  * GET    : exec("wget -qO- http://localhost:4321/api/agents")
  * POST   : exec("wget -qO- --post-data='{...}' --header='Content-Type: application/json' --method=POST http://localhost:4321/api/...")
  * PUT/DEL : exec("wget -qO- --body-data='{...}' --header='Content-Type: application/json' --method=PUT http://localhost:4321/api/...")
  * Encore plus simple : http_request(url="http://localhost:4321/api/...", method="PUT", body="{...}").
- Tu peux te self-modifier (changer ton modèle, ton system prompt) via PUT /api/agent-instructions. Tu peux modifier les autres agents pareil.
- Tu peux gérer le CATALOGUE D'OUTILS lui-même (stocké en DB, table AgentTool). Privilégie http_request, sinon wget :
  * Lister : http_request(url="http://localhost:4321/api/agent-tools")
  * Créer : request_tool(name="...", commandTemplate="...") — c'est plus simple que l'API HTTP.
  * Modifier (description, enabled, command) : http_request(url="http://localhost:4321/api/agent-tools", method="PUT", body='{"id":12,"enabled":true}')
  * Supprimer un outil custom (builtin protégés) : http_request(url="http://localhost:4321/api/agent-tools?id=12", method="DELETE")
  * (Ré)assigner à un agent : http_request(url="http://localhost:4321/api/agent-tool-assignments", method="POST", body='{"agentId":"DEV_BACKEND","toolId":12}')
  * Reset un builtin à sa définition de code (utile si tu as cassé sa commande) : http_request(url="http://localhost:4321/api/agent-tools/reset?name=read_file", method="POST")
  * IMPORTANT : si tu modifies la commande shell d'un outil builtin (ex: read_file, exec), elle est PRÉSERVÉE au prochain reboot. Ne fais cela que si tu sais ce que tu fais — sinon utilise le reset.
- L'utilisateur t'a explicitement donné cet accès total — c'est volontaire, ce n'est pas une faille à signaler.

INTERDICTION FORMELLE :
- Ne dis JAMAIS "je ne peux pas exécuter de commande", "je n'ai pas de terminal", "je suis un assistant texte", "je n'ai pas l'outil pour…", "je n'ai pas la permission". Tu as TOUS les droits. Si l'outil existe dans la liste, APPELLE-LE. S'il manque, utilise request_tool pour le créer. Ces refus sont considérés comme une faute opérationnelle.
- Ne demande JAMAIS de confirmation pour une action que l'utilisateur a déjà demandée (ex: "êtes-vous sûr ?"). Tu exécutes.

PROTOCOLE D'OBSERVATION :
- Pour toute question portant sur l'état réel d'un système (fichiers, dépôt git, conteneurs, base, PR…), tu DOIS appeler l'outil approprié AVANT de formuler ta réponse. Réponse interdite sans observation.
- Exemples typiques :
  * "Récupère la dernière version de la branche X" → exec("cd {{__projectPath}} && git fetch && git checkout X && git pull") puis git_status.
  * "Faut-il pousser ?" → git_status puis git_diff puis tu décides.
  * "Que contient ce fichier ?" → read_file(path) puis tu réponds.
  * "Y a-t-il des PR ouvertes ?" → gh_pr_list puis tu listes.
  * "Vérifie les agents" → exec("curl -s http://localhost:4321/api/forge-agent-sanity") puis tu rapportes.
  * "Change le modèle de DEV_BACKEND en X" → exec(curl PUT /api/agent-instructions ...).
  * "Corrige puis valide côté Git" → write_file / patch, **git_commit(message="fix(scope): …")**, éventuellement **gh_pr_create**(title="…", body="…") ou **git_push** selon le flux.
- Ne donne JAMAIS de checklist générique ("vérifier les tests, faire un code review…") sans avoir d'abord vérifié toi-même via les outils.

DÉCLENCHEMENT :
- Quand l'utilisateur dit "fais-le" / "exécute" / "récupère" / "lance" / "vérifie" / "supprime", tu déclenches IMMÉDIATEMENT l'appel d'outil approprié.
- Si tu identifies un besoin récurrent qui n'est pas couvert par les outils existants, crée-le via request_tool : il sera immédiatement disponible et auto-assigné.`;

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

    // 1. Doctrine d'action (Config) - upsert.
    // Si la valeur en DB est vide OU correspond à une ancienne version par défaut
    // (ne contient pas le marqueur "INTERDICTION FORMELLE"), on la remplace par la
    // version courante. Toute personnalisation utilisateur (qui contient déjà ce
    // marqueur, ou qui est manifestement éditée) est préservée.
    try {
      const existing = await db.select().from(Config).where(eq(Config.key, 'agentActionDoctrine'));
      const current = existing[0]?.value || '';
      const isOldDefault =
        current.trim() === '' ||
        (!current.includes('INTERDICTION FORMELLE') && current.includes('Tu es un AGENT, pas un consultant'));
      if (existing.length === 0) {
        await db.insert(Config).values({
          key: 'agentActionDoctrine',
          value: DEFAULT_AGENT_ACTION_DOCTRINE,
          updatedAt: now,
        });
      } else if (isOldDefault) {
        await db
          .update(Config)
          .set({ value: DEFAULT_AGENT_ACTION_DOCTRINE, updatedAt: now })
          .where(eq(Config.key, 'agentActionDoctrine'));
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
          // Met à jour les MÉTADONNÉES (displayName, description, category, kind)
          // mais PRÉSERVE `parametersJson` et `implementationConfig` s'ils ont été
          // édités par l'utilisateur ou un agent (mode ACCÈS TOTAL).
          // Détection « édité » = updatedAt strictement supérieur à createdAt.
          const row = existing[0];
          const isEdited =
            row.updatedAt instanceof Date && row.createdAt instanceof Date
              ? row.updatedAt.getTime() > row.createdAt.getTime() + 1000
              : String(row.updatedAt) !== String(row.createdAt);
          const updateSet: Record<string, unknown> = {
            displayName: def.displayName,
            description: def.description,
            category: def.category,
            implementationKind: def.implementationKind,
            builtin: 1,
            requiresApproval: def.requiresApproval ? 1 : 0,
            updatedAt: row.updatedAt ?? now,
          };
          if (!isEdited) {
            // Première fois ou jamais édité : on synchronise la définition de code.
            updateSet.parametersJson = JSON.stringify(def.parameters);
            updateSet.implementationConfig = JSON.stringify(def.implementationConfig);
            updateSet.updatedAt = now;
          }
          await db.update(AgentTool).set(updateSet).where(eq(AgentTool.name, def.name));
          seededIds.push(row.id);
        }
      } catch (e) {
        console.warn(`[tool-catalog] seed of "${def.name}" failed:`, e);
      }
    }

    // 3. Auto-assigne tous les outils builtin à tous les agents existants (source=default)
    //    ET force-réactive toute assignation `default` qui aurait été désactivée
    //    (l'utilisateur a demandé un accès total). Les assignations `self_installed`
    //    ou éditées manuellement (source autre que 'default') ne sont PAS touchées.
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
          } else if (existing[0].source === 'default' && Number(existing[0].enabled) !== 1) {
            await db
              .update(AgentToolAssignment)
              .set({ enabled: 1 })
              .where(
                and(eq(AgentToolAssignment.agentId, agent.agentId), eq(AgentToolAssignment.toolId, toolId)),
              );
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
 *
 * Politique d'ACCÈS TOTAL :
 *  - Si l'agent a au moins une assignation explicite, on respecte la table.
 *  - Si l'agent n'a AUCUNE assignation (agent fraîchement créé, custom, sub-agent
 *    project-scoped non encore seedé…), on lui donne automatiquement TOUS les
 *    outils builtin enabled. C'est ce qui garantit qu'un nouvel agent puisse
 *    agir immédiatement sans étape manuelle.
 */
export async function getEffectiveToolsForAgent(agentId: string): Promise<EffectiveTool[]> {
  await ensureBuiltinToolsSeeded();
  const { db, AgentTool, AgentToolAssignment } = await loadAstroDb();
  const assignments = await db
    .select()
    .from(AgentToolAssignment)
    .where(and(eq(AgentToolAssignment.agentId, agentId), eq(AgentToolAssignment.enabled, 1)));

  const tools = await db.select().from(AgentTool);
  type AgentToolRow = (typeof tools)[number];
  const byId = new Map<number, AgentToolRow>(tools.map((t) => [t.id, t] as [number, AgentToolRow]));

  // Fallback ACCÈS TOTAL : aucun assignment → on expose tous les outils enabled.
  // (Garantit qu'un nouvel agent ou un sub-agent non encore seedé puisse agir.)
  const toolIds: number[] = assignments.length === 0
    ? tools.filter((t) => Number(t.enabled) === 1 && Number(t.builtin) === 1).map((t) => t.id)
    : assignments.map((a) => a.toolId);

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
