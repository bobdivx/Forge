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
import type { ToolClassification, ResolvedToolClassification } from './forge-tool-contract';
import { resolveClassification } from './forge-tool-contract';

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
  category: 'filesystem' | 'git' | 'github' | 'shell' | 'forge' | 'network' | 'docker' | 'install';
  parameters: ToolParametersSchema;
  implementationKind: ToolImplementationKind;
  implementationConfig: Record<string, unknown>;
  requiresApproval?: boolean;
  /**
   * Classification optionnelle (Phase 2) — utilisée par le permission engine
   * et le scheduler. Si absente, on tombe sur des heuristiques basées sur le
   * nom de l'outil.
   */
  classification?: ToolClassification;
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
    classification: { isReadOnly: true, isConcurrencySafe: true, runtimeProfile: 'both' },
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
    classification: { isDestructive: true, runtimeProfile: 'worker' },
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
    classification: { isDestructive: true, runtimeProfile: 'worker' },
  },

  // ── Forge ────────────────────────────────────────────────────────────────
  {
    name: 'create_module',
    displayName: 'Créer un module Store',
    description: "Permet de créer un module métier Forge et de le sauvegarder dans le store local (ex: module github, docker). Un module peut contenir plusieurs configurations d'outils ou agents.",
    category: 'forge',
    parameters: {
      type: 'object',
      properties: {
        identifier: { type: 'string', description: 'Identifiant unique (ex: module-github)' },
        name: { type: 'string', description: 'Nom lisible du module' },
        description: { type: 'string', description: 'Description du module' },
        payload: { type: 'string', description: 'JSON stringifié contenant la configuration du module' },
        isMcp: { type: 'number', description: '1 si c\'est un serveur MCP, 0 sinon' },
        mcpUrl: { type: 'string', description: 'URL du serveur MCP si applicable' },
      },
      required: ['identifier', 'name'],
    },
    implementationKind: 'builtin',
    implementationConfig: { handler: 'create_module' },
    classification: { isDestructive: true, runtimeProfile: 'both' },
  },
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
    classification: { isReadOnly: true, isConcurrencySafe: true, runtimeProfile: 'both' },
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
    classification: { isReadOnly: true, isConcurrencySafe: true, runtimeProfile: 'both' },
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
    classification: { isReadOnly: true, isConcurrencySafe: true, runtimeProfile: 'both' },
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
    classification: { isReadOnly: true, isConcurrencySafe: true, runtimeProfile: 'both' },
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
    classification: { isDestructive: true, runtimeProfile: 'worker' },
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
    classification: { isDestructive: true, runtimeProfile: 'worker' },
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
    classification: { isReadOnly: true, isConcurrencySafe: true, runtimeProfile: 'both' },
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
    classification: { isReadOnly: true, isConcurrencySafe: true, runtimeProfile: 'both' },
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
    classification: { isDestructive: true, runtimeProfile: 'worker' },
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
    classification: { isReadOnly: true, isConcurrencySafe: true, runtimeProfile: 'both' },
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
    classification: { isReadOnly: true, isConcurrencySafe: true, runtimeProfile: 'both' },
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
    classification: { isReadOnly: true, isConcurrencySafe: true, runtimeProfile: 'both' },
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
    classification: { isReadOnly: true, isConcurrencySafe: true, runtimeProfile: 'both' },
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
    classification: { isDestructive: true, runtimeProfile: 'worker' },
  },

  // ── Phase 3 — Install & FS étendus ────────────────────────────────────────
  {
    name: 'install_tool',
    displayName: 'Installer un paquet',
    description:
      "Installe un paquet/outil via le bon gestionnaire selon l'hôte (winget/scoop sous Windows, apt/apk dans le conteneur Linux, brew sous macOS, ou npm -g / pip / cargo si pertinent).",
    category: 'install',
    parameters: {
      type: 'object',
      properties: {
        pkg: { type: 'string', description: 'Nom du paquet à installer (ex: ripgrep, gh, jq, @astrojs/check)' },
        manager: {
          type: 'string',
          description: "Forcer un gestionnaire spécifique. 'auto' par défaut.",
          enum: ['auto', 'winget', 'scoop', 'apt', 'apk', 'brew', 'npm', 'pip', 'cargo'],
        },
      },
      required: ['pkg'],
    },
    implementationKind: 'builtin',
    implementationConfig: { handler: 'install_tool' },
    classification: { isDestructive: true, runtimeProfile: 'worker' },
  },
  {
    name: 'fs_mkdir',
    displayName: 'Créer un dossier',
    description: 'Crée un répertoire (récursivement par défaut).',
    category: 'filesystem',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Chemin du dossier à créer' },
        recursive: { type: 'boolean', description: 'Créer les parents si nécessaire (défaut true)' },
      },
      required: ['path'],
    },
    implementationKind: 'builtin',
    implementationConfig: { handler: 'fs_mkdir' },
    classification: { isDestructive: true, runtimeProfile: 'worker' },
  },
  {
    name: 'fs_delete',
    displayName: 'Supprimer un fichier/dossier',
    description: 'Supprime un fichier ou dossier. recursive=true pour les dossiers non vides.',
    category: 'filesystem',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Chemin à supprimer' },
        recursive: { type: 'boolean', description: 'Mode -rf' },
      },
      required: ['path'],
    },
    implementationKind: 'builtin',
    implementationConfig: { handler: 'fs_delete' },
    classification: { isDestructive: true, runtimeProfile: 'worker' },
  },
  {
    name: 'fs_chmod',
    displayName: 'Changer les permissions',
    description: 'Modifie les permissions Unix (mode octal).',
    category: 'filesystem',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Chemin cible' },
        mode: { type: 'string', description: 'Mode octal (ex: 644, 755, 0755)' },
      },
      required: ['path', 'mode'],
    },
    implementationKind: 'builtin',
    implementationConfig: { handler: 'fs_chmod' },
    classification: { isDestructive: true, runtimeProfile: 'worker' },
  },
  {
    name: 'fs_search',
    displayName: 'Rechercher (ripgrep)',
    description: "Recherche par nom ou contenu (utilise ripgrep si disponible, sinon grep). Limite à 200 résultats.",
    category: 'filesystem',
    parameters: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Pattern à chercher' },
        path: { type: 'string', description: 'Racine de recherche (défaut: répertoire courant)' },
        mode: { type: 'string', enum: ['name', 'content'], description: 'name = par nom, content = grep' },
      },
      required: ['pattern'],
    },
    implementationKind: 'builtin',
    implementationConfig: { handler: 'fs_search' },
    classification: { isReadOnly: true, isConcurrencySafe: true, runtimeProfile: 'both' },
  },

  // ── Phase 3 — Docker (API native via socket / CLI fallback) ───────────────
  {
    name: 'docker_container_create',
    displayName: 'Docker : créer/lancer un conteneur',
    description: "docker run équivalent : crée et démarre un conteneur. detach=true par défaut.",
    category: 'docker',
    parameters: {
      type: 'object',
      properties: {
        image: { type: 'string', description: 'Image Docker (ex: nginx:alpine)' },
        name: { type: 'string', description: 'Nom du conteneur (optionnel)' },
        env: { type: 'string', description: 'JSON de variables d\'environnement (ex: {"FOO":"BAR"})' },
        ports: { type: 'string', description: 'JSON array de mappings de ports (ex: ["8080:80"])' },
        volumes: { type: 'string', description: 'JSON array de volumes (ex: ["/host:/container"])' },
        cmd: { type: 'string', description: 'Commande à exécuter dans le conteneur (optionnel)' },
        detach: { type: 'boolean', description: 'true = détaché (-d), défaut true' },
      },
      required: ['image'],
    },
    implementationKind: 'builtin',
    implementationConfig: { handler: 'docker_container_create' },
    classification: { isDestructive: true, runtimeProfile: 'worker' },
  },
  {
    name: 'docker_container_start',
    displayName: 'Docker : démarrer',
    description: 'Démarre un conteneur existant.',
    category: 'docker',
    parameters: {
      type: 'object',
      properties: { name: { type: 'string', description: 'Nom ou ID' } },
      required: ['name'],
    },
    implementationKind: 'builtin',
    implementationConfig: { handler: 'docker_container_start' },
    classification: { isDestructive: true, runtimeProfile: 'worker' },
  },
  {
    name: 'docker_container_stop',
    displayName: 'Docker : arrêter',
    description: 'Arrête un conteneur (SIGTERM puis SIGKILL après timeoutSec).',
    category: 'docker',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Nom ou ID' },
        timeoutSec: { type: 'integer', description: 'Timeout en secondes (défaut 10)' },
      },
      required: ['name'],
    },
    implementationKind: 'builtin',
    implementationConfig: { handler: 'docker_container_stop' },
    classification: { isDestructive: true, runtimeProfile: 'worker' },
  },
  {
    name: 'docker_container_restart',
    displayName: 'Docker : redémarrer',
    description: 'Redémarre un conteneur.',
    category: 'docker',
    parameters: {
      type: 'object',
      properties: { name: { type: 'string', description: 'Nom ou ID' } },
      required: ['name'],
    },
    implementationKind: 'builtin',
    implementationConfig: { handler: 'docker_container_restart' },
    classification: { isDestructive: true, runtimeProfile: 'worker' },
  },
  {
    name: 'docker_container_remove',
    displayName: 'Docker : supprimer un conteneur',
    description: 'Supprime un conteneur. force=true permet de supprimer un conteneur running.',
    category: 'docker',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Nom ou ID' },
        force: { type: 'boolean', description: '-f' },
      },
      required: ['name'],
    },
    implementationKind: 'builtin',
    implementationConfig: { handler: 'docker_container_remove' },
    classification: { isDestructive: true, runtimeProfile: 'worker' },
  },
  {
    name: 'docker_container_exec',
    displayName: 'Docker : exec',
    description: "Exécute une commande dans un conteneur (docker exec).",
    category: 'docker',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Nom ou ID du conteneur' },
        command: { type: 'string', description: 'Commande shell à exécuter dans le conteneur' },
      },
      required: ['name', 'command'],
    },
    implementationKind: 'builtin',
    implementationConfig: { handler: 'docker_container_exec' },
    classification: { isDestructive: true, runtimeProfile: 'worker' },
  },
  {
    name: 'docker_container_logs_tail',
    displayName: 'Docker : tail logs',
    description: 'Renvoie les N dernières lignes de logs d\'un conteneur.',
    category: 'docker',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Nom ou ID' },
        lines: { type: 'integer', description: 'Nombre de lignes (défaut 100)' },
      },
      required: ['name'],
    },
    implementationKind: 'builtin',
    implementationConfig: { handler: 'docker_container_logs_tail' },
    classification: { isReadOnly: true, isConcurrencySafe: true, runtimeProfile: 'both' },
  },
  {
    name: 'docker_image_pull',
    displayName: 'Docker : pull image',
    description: "Télécharge une image Docker depuis un registre.",
    category: 'docker',
    parameters: {
      type: 'object',
      properties: { image: { type: 'string', description: 'Référence image (ex: nginx:alpine)' } },
      required: ['image'],
    },
    implementationKind: 'builtin',
    implementationConfig: { handler: 'docker_image_pull' },
    classification: { isDestructive: true, runtimeProfile: 'worker' },
  },
  {
    name: 'docker_image_build',
    displayName: 'Docker : build image',
    description: 'Construit une image Docker depuis un Dockerfile.',
    category: 'docker',
    parameters: {
      type: 'object',
      properties: {
        contextPath: { type: 'string', description: 'Chemin du contexte de build' },
        tag: { type: 'string', description: 'Tag de l\'image' },
        dockerfile: { type: 'string', description: 'Chemin du Dockerfile (-f), optionnel' },
      },
      required: ['contextPath', 'tag'],
    },
    implementationKind: 'builtin',
    implementationConfig: { handler: 'docker_image_build' },
    classification: { isDestructive: true, runtimeProfile: 'worker' },
  },
  {
    name: 'docker_image_list',
    displayName: 'Docker : images',
    description: 'Liste les images Docker disponibles.',
    category: 'docker',
    parameters: { type: 'object', properties: {} },
    implementationKind: 'builtin',
    implementationConfig: { handler: 'docker_image_list' },
    classification: { isReadOnly: true, isConcurrencySafe: true, runtimeProfile: 'both' },
  },
  {
    name: 'docker_compose_up',
    displayName: 'Docker Compose : up',
    description: 'Démarre une stack docker compose.',
    category: 'docker',
    parameters: {
      type: 'object',
      properties: {
        composeFile: { type: 'string', description: 'Chemin du docker-compose.yml' },
        detach: { type: 'boolean', description: 'Mode détaché (-d), défaut true' },
      },
      required: ['composeFile'],
    },
    implementationKind: 'builtin',
    implementationConfig: { handler: 'docker_compose_up' },
    classification: { isDestructive: true, runtimeProfile: 'worker' },
  },
  {
    name: 'docker_compose_down',
    displayName: 'Docker Compose : down',
    description: 'Arrête et supprime une stack docker compose.',
    category: 'docker',
    parameters: {
      type: 'object',
      properties: { composeFile: { type: 'string', description: 'Chemin du docker-compose.yml' } },
      required: ['composeFile'],
    },
    implementationKind: 'builtin',
    implementationConfig: { handler: 'docker_compose_down' },
    classification: { isDestructive: true, runtimeProfile: 'worker' },
  },
  {
    name: 'docker_volume_list',
    displayName: 'Docker : volumes',
    description: 'Liste les volumes Docker.',
    category: 'docker',
    parameters: { type: 'object', properties: {} },
    implementationKind: 'builtin',
    implementationConfig: { handler: 'docker_volume_list' },
    classification: { isReadOnly: true, isConcurrencySafe: true, runtimeProfile: 'both' },
  },
  {
    name: 'docker_volume_remove',
    displayName: 'Docker : supprimer un volume',
    description: 'Supprime un volume Docker (destructif).',
    category: 'docker',
    parameters: {
      type: 'object',
      properties: { name: { type: 'string', description: 'Nom du volume' } },
      required: ['name'],
    },
    implementationKind: 'builtin',
    implementationConfig: { handler: 'docker_volume_remove' },
    classification: { isDestructive: true, runtimeProfile: 'worker' },
  },
  {
    name: 'docker_network_list',
    displayName: 'Docker : networks',
    description: 'Liste les réseaux Docker.',
    category: 'docker',
    parameters: { type: 'object', properties: {} },
    implementationKind: 'builtin',
    implementationConfig: { handler: 'docker_network_list' },
    classification: { isReadOnly: true, isConcurrencySafe: true, runtimeProfile: 'both' },
  },
  {
    name: 'docker_info',
    displayName: 'Docker : info',
    description: 'Retourne les informations système Docker (JSON).',
    category: 'docker',
    parameters: { type: 'object', properties: {} },
    implementationKind: 'builtin',
    implementationConfig: { handler: 'docker_info' },
    classification: { isReadOnly: true, isConcurrencySafe: true, runtimeProfile: 'both' },
  },

  // ── Phase 3 — GitHub API native ───────────────────────────────────────────
  {
    name: 'gh_api',
    displayName: 'GitHub API',
    description: 'Appel API GitHub générique (endpoint, method, body).',
    category: 'github',
    parameters: {
      type: 'object',
      properties: {
        endpoint: { type: 'string', description: 'Endpoint API (ex: /repos/owner/repo/pulls)' },
        method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] },
        body: { type: 'string', description: 'Body JSON (objet ou string)' },
      },
      required: ['endpoint'],
    },
    implementationKind: 'builtin',
    implementationConfig: { handler: 'gh_api' },
    classification: { runtimeProfile: 'worker' },
  },
  {
    name: 'gh_pr_list_api',
    displayName: 'GitHub : PRs (API)',
    description: 'Liste les PR via l\'API GitHub (au lieu du CLI gh).',
    category: 'github',
    parameters: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Owner GitHub' },
        repo: { type: 'string', description: 'Nom du repo' },
        state: { type: 'string', enum: ['open', 'closed', 'all'] },
      },
      required: ['owner', 'repo'],
    },
    implementationKind: 'builtin',
    implementationConfig: { handler: 'gh_pr_list_api' },
    classification: { isReadOnly: true, isConcurrencySafe: true, runtimeProfile: 'both' },
  },
  {
    name: 'gh_pr_get',
    displayName: 'GitHub : détail PR',
    description: 'Récupère le détail d\'une PR (diff, état, reviews) via API.',
    category: 'github',
    parameters: {
      type: 'object',
      properties: {
        owner: { type: 'string' },
        repo: { type: 'string' },
        number: { type: 'integer' },
      },
      required: ['owner', 'repo', 'number'],
    },
    implementationKind: 'builtin',
    implementationConfig: { handler: 'gh_pr_get' },
    classification: { isReadOnly: true, isConcurrencySafe: true, runtimeProfile: 'both' },
  },
  {
    name: 'gh_pr_merge',
    displayName: 'GitHub : merger PR',
    description: 'Merge une PR (méthodes: merge, squash, rebase).',
    category: 'github',
    parameters: {
      type: 'object',
      properties: {
        owner: { type: 'string' },
        repo: { type: 'string' },
        number: { type: 'integer' },
        merge_method: { type: 'string', enum: ['merge', 'squash', 'rebase'] },
        commit_title: { type: 'string' },
        commit_message: { type: 'string' },
      },
      required: ['owner', 'repo', 'number'],
    },
    implementationKind: 'builtin',
    implementationConfig: { handler: 'gh_pr_merge' },
    classification: { isDestructive: true, runtimeProfile: 'worker' },
  },
  {
    name: 'gh_pr_close',
    displayName: 'GitHub : fermer PR',
    description: 'Ferme une PR sans merger.',
    category: 'github',
    parameters: {
      type: 'object',
      properties: { owner: { type: 'string' }, repo: { type: 'string' }, number: { type: 'integer' } },
      required: ['owner', 'repo', 'number'],
    },
    implementationKind: 'builtin',
    implementationConfig: { handler: 'gh_pr_close' },
    classification: { isDestructive: true, runtimeProfile: 'worker' },
  },
  {
    name: 'gh_pr_review',
    displayName: 'GitHub : review PR',
    description: 'Crée une review (COMMENT, APPROVE, REQUEST_CHANGES).',
    category: 'github',
    parameters: {
      type: 'object',
      properties: {
        owner: { type: 'string' },
        repo: { type: 'string' },
        number: { type: 'integer' },
        event: { type: 'string', enum: ['COMMENT', 'APPROVE', 'REQUEST_CHANGES'] },
        body: { type: 'string' },
      },
      required: ['owner', 'repo', 'number', 'event'],
    },
    implementationKind: 'builtin',
    implementationConfig: { handler: 'gh_pr_review' },
    classification: { runtimeProfile: 'worker' },
  },
  {
    name: 'gh_pr_comment',
    displayName: 'GitHub : commenter PR',
    description: 'Ajoute un commentaire à une PR (alias issue comments).',
    category: 'github',
    parameters: {
      type: 'object',
      properties: {
        owner: { type: 'string' },
        repo: { type: 'string' },
        number: { type: 'integer' },
        body: { type: 'string' },
      },
      required: ['owner', 'repo', 'number', 'body'],
    },
    implementationKind: 'builtin',
    implementationConfig: { handler: 'gh_pr_comment' },
    classification: { runtimeProfile: 'worker' },
  },
  {
    name: 'gh_issue_list',
    displayName: 'GitHub : issues',
    description: 'Liste les issues d\'un repo.',
    category: 'github',
    parameters: {
      type: 'object',
      properties: {
        owner: { type: 'string' },
        repo: { type: 'string' },
        state: { type: 'string', enum: ['open', 'closed', 'all'] },
      },
      required: ['owner', 'repo'],
    },
    implementationKind: 'builtin',
    implementationConfig: { handler: 'gh_issue_list' },
    classification: { isReadOnly: true, isConcurrencySafe: true, runtimeProfile: 'both' },
  },
  {
    name: 'gh_issue_create',
    displayName: 'GitHub : créer une issue',
    description: 'Crée une issue (titre, body, labels, assignees).',
    category: 'github',
    parameters: {
      type: 'object',
      properties: {
        owner: { type: 'string' },
        repo: { type: 'string' },
        title: { type: 'string' },
        body: { type: 'string' },
        labels: { type: 'string', description: 'JSON array de labels' },
        assignees: { type: 'string', description: 'JSON array d\'utilisateurs' },
      },
      required: ['owner', 'repo', 'title'],
    },
    implementationKind: 'builtin',
    implementationConfig: { handler: 'gh_issue_create' },
    classification: { runtimeProfile: 'worker' },
  },
  {
    name: 'gh_issue_close',
    displayName: 'GitHub : fermer issue',
    description: 'Ferme une issue.',
    category: 'github',
    parameters: {
      type: 'object',
      properties: { owner: { type: 'string' }, repo: { type: 'string' }, number: { type: 'integer' } },
      required: ['owner', 'repo', 'number'],
    },
    implementationKind: 'builtin',
    implementationConfig: { handler: 'gh_issue_close' },
    classification: { isDestructive: true, runtimeProfile: 'worker' },
  },
  {
    name: 'gh_issue_comment',
    displayName: 'GitHub : commenter issue',
    description: 'Ajoute un commentaire à une issue.',
    category: 'github',
    parameters: {
      type: 'object',
      properties: {
        owner: { type: 'string' },
        repo: { type: 'string' },
        number: { type: 'integer' },
        body: { type: 'string' },
      },
      required: ['owner', 'repo', 'number', 'body'],
    },
    implementationKind: 'builtin',
    implementationConfig: { handler: 'gh_issue_comment' },
    classification: { runtimeProfile: 'worker' },
  },
  {
    name: 'gh_issue_label',
    displayName: 'GitHub : labels issue',
    description: 'Ajoute des labels à une issue.',
    category: 'github',
    parameters: {
      type: 'object',
      properties: {
        owner: { type: 'string' },
        repo: { type: 'string' },
        number: { type: 'integer' },
        labels: { type: 'string', description: 'JSON array de labels' },
      },
      required: ['owner', 'repo', 'number', 'labels'],
    },
    implementationKind: 'builtin',
    implementationConfig: { handler: 'gh_issue_label' },
    classification: { runtimeProfile: 'worker' },
  },
  {
    name: 'gh_workflow_runs',
    displayName: 'GitHub Actions : runs',
    description: 'Liste les workflow runs récents.',
    category: 'github',
    parameters: {
      type: 'object',
      properties: {
        owner: { type: 'string' },
        repo: { type: 'string' },
        status: { type: 'string', description: 'queued, in_progress, completed, failure, ...' },
        branch: { type: 'string' },
      },
      required: ['owner', 'repo'],
    },
    implementationKind: 'builtin',
    implementationConfig: { handler: 'gh_workflow_runs' },
    classification: { isReadOnly: true, isConcurrencySafe: true, runtimeProfile: 'both' },
  },
  {
    name: 'gh_workflow_cancel',
    displayName: 'GitHub Actions : annuler run',
    description: 'Annule un workflow run en cours.',
    category: 'github',
    parameters: {
      type: 'object',
      properties: { owner: { type: 'string' }, repo: { type: 'string' }, runId: { type: 'integer' } },
      required: ['owner', 'repo', 'runId'],
    },
    implementationKind: 'builtin',
    implementationConfig: { handler: 'gh_workflow_cancel' },
    classification: { isDestructive: true, runtimeProfile: 'worker' },
  },
  {
    name: 'gh_workflow_rerun',
    displayName: 'GitHub Actions : relancer run',
    description: 'Relance un workflow run.',
    category: 'github',
    parameters: {
      type: 'object',
      properties: { owner: { type: 'string' }, repo: { type: 'string' }, runId: { type: 'integer' } },
      required: ['owner', 'repo', 'runId'],
    },
    implementationKind: 'builtin',
    implementationConfig: { handler: 'gh_workflow_rerun' },
    classification: { runtimeProfile: 'worker' },
  },
  {
    name: 'gh_dependabot_alerts',
    displayName: 'GitHub : Dependabot alerts',
    description: 'Liste les alertes Dependabot d\'un repo.',
    category: 'github',
    parameters: {
      type: 'object',
      properties: {
        owner: { type: 'string' },
        repo: { type: 'string' },
        state: { type: 'string', enum: ['open', 'dismissed', 'fixed', 'auto_dismissed'] },
      },
      required: ['owner', 'repo'],
    },
    implementationKind: 'builtin',
    implementationConfig: { handler: 'gh_dependabot_alerts' },
    classification: { isReadOnly: true, isConcurrencySafe: true, runtimeProfile: 'both' },
  },
  {
    name: 'gh_security_advisories',
    displayName: 'GitHub : code scanning alerts',
    description: 'Liste les alertes Code Scanning (CodeQL, etc.).',
    category: 'github',
    parameters: {
      type: 'object',
      properties: {
        owner: { type: 'string' },
        repo: { type: 'string' },
        state: { type: 'string', enum: ['open', 'closed', 'dismissed', 'fixed'] },
      },
      required: ['owner', 'repo'],
    },
    implementationKind: 'builtin',
    implementationConfig: { handler: 'gh_security_advisories' },
    classification: { isReadOnly: true, isConcurrencySafe: true, runtimeProfile: 'both' },
  },
  {
    name: 'gh_branches_list',
    displayName: 'GitHub : branches',
    description: 'Liste les branches d\'un repo.',
    category: 'github',
    parameters: {
      type: 'object',
      properties: { owner: { type: 'string' }, repo: { type: 'string' } },
      required: ['owner', 'repo'],
    },
    implementationKind: 'builtin',
    implementationConfig: { handler: 'gh_branches_list' },
    classification: { isReadOnly: true, isConcurrencySafe: true, runtimeProfile: 'both' },
  },
  {
    name: 'gh_release_create',
    displayName: 'GitHub : créer release',
    description: 'Crée une release sur un repo.',
    category: 'github',
    parameters: {
      type: 'object',
      properties: {
        owner: { type: 'string' },
        repo: { type: 'string' },
        tag_name: { type: 'string' },
        name: { type: 'string' },
        body: { type: 'string' },
        draft: { type: 'boolean' },
        prerelease: { type: 'boolean' },
      },
      required: ['owner', 'repo', 'tag_name'],
    },
    implementationKind: 'builtin',
    implementationConfig: { handler: 'gh_release_create' },
    classification: { isDestructive: true, runtimeProfile: 'worker' },
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
- L'environnement d'exécution est un conteneur basé sur Alpine Linux. L'utilisation de commandes telles que \`sudo\`, \`apt-get\`, ou l'appel à des scripts imaginaires ou inexistants (comme \`audit_project\`) est STRICTEMENT INTERDITE. Utilise \`apk\` si nécessaire, et exécute uniquement les outils et scripts documentés dans Forge.

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
    const { db, AgentTool, AgentToolAssignment, AgentInstruction, Config, ForgeModule } = await loadAstroDb();
    const now = new Date();

    // 0. Seed des modules de base (Store)
    const defaultModules = [
      { identifier: 'module-github', name: 'Intégration GitHub', description: 'Outils et actions pour l\'intégration avec GitHub (PRs, releases, code scanning).' },
      { identifier: 'module-docker', name: 'Docker / ZimaOS', description: 'Outils de gestion des conteneurs locaux et ZimaOS.' },
      { identifier: 'module-vercel', name: 'Vercel Deployments', description: 'Gestion des déploiements Vercel.' },
      { identifier: 'module-pet', name: 'Agent Pet', description: 'Compagnon virtuel et système de récompenses pour les développeurs.' },
    ];
    try {
      if (ForgeModule) {
        for (const mod of defaultModules) {
          const existing = await db.select().from(ForgeModule).where(eq(ForgeModule.identifier, mod.identifier));
          if (existing.length === 0) {
            await db.insert(ForgeModule).values({
              ...mod,
              version: '1.0.0',
              installed: 1, // On considère ces core features comme déjà installées
              published: 1,
              payload: '{}',
              createdAt: now,
              updatedAt: now,
            });
          }
        }
      }
    } catch (e) {
      console.warn('[tool-catalog] default modules seed failed:', e);
    }

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
      // Injecter la classification (Phase 2) dans implementationConfig pour
      // qu'elle survive au round-trip DB.
      const cfgWithClassification: Record<string, unknown> = {
        ...def.implementationConfig,
        classification: resolveClassification(def.classification),
      };
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
              implementationConfig: JSON.stringify(cfgWithClassification),
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
            updateSet.implementationConfig = JSON.stringify(cfgWithClassification);
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
  /** Classification résolue (avec défauts fail-closed). */
  classification: ResolvedToolClassification;
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
  const { db, AgentTool, AgentToolAssignment, ForgeModule } = await loadAstroDb();
  const assignments = await db
    .select()
    .from(AgentToolAssignment)
    .where(and(eq(AgentToolAssignment.agentId, agentId), eq(AgentToolAssignment.enabled, 1)));

  const tools = await db.select().from(AgentTool);
  let modules: { identifier: string; installed: number }[] = [];
  try {
    if (ForgeModule) modules = await db.select().from(ForgeModule);
  } catch {
    // Ignore if ForgeModule table is somehow missing
  }
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

    // Filter out tools if their corresponding module is uninstalled
    if (modules.length > 0) {
      const moduleForTool = modules.find((m) => m.identifier === `module-${t.category}`);
      if (moduleForTool && moduleForTool.installed !== 1) {
        continue;
      }
    }
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
    const cls = resolveClassification((cfg.classification ?? null) as ToolClassification | null);
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
      classification: cls,
    });
  }
  return out;
}
