/**
 * forge-commands.ts — Registre des commandes slash pour le REPL Forge.
 * Isomorphique (client + serveur) — pas d'imports Node.js.
 */

export type CommandDef = {
  name: string;
  description: string;
  usage: string;
  aliases?: string[];
  examples?: string[];
};

export const FORGE_COMMANDS: CommandDef[] = [
  {
    name: 'help',
    description: 'Affiche les commandes disponibles',
    usage: '/help [commande]',
    examples: ['/help', '/help memory'],
  },
  {
    name: 'tools',
    description: 'Liste ou exécute les outils Forge (git, docker, file…)',
    usage: '/tools list | /tools run <outil> [clé=valeur …]',
    examples: [
      '/tools list',
      '/tools run git_status project=my-app',
      '/tools run git_log project=my-app limit=5',
      '/tools run docker_ps',
      '/tools run projects_list',
    ],
  },
  {
    name: 'memory',
    description: "Mémoire persistante par agent (stockée en Astro DB)",
    usage: '/memory list | /memory add <contenu> | /memory delete <id> | /memory clear',
    aliases: ['mem'],
    examples: [
      '/memory list',
      '/memory add Toujours utiliser Preact pour les composants',
      '/memory delete 3',
      '/memory clear',
    ],
  },
  {
    name: 'task',
    description: 'Crée ou liste les tâches agents',
    usage: '/task list | /task create <agentId> <description>',
    aliases: ['tasks'],
    examples: [
      '/task list',
      '/task create dev-frontend Implémenter la page de profil',
    ],
  },
  {
    name: 'clear',
    description: "Efface l'historique affiché du terminal",
    usage: '/clear',
    examples: ['/clear'],
  },
];

// ── Parser ────────────────────────────────────────────────────────────────────

export type ParsedCommand = {
  name: string;
  args: string[];
  raw: string;
};

export function parseCommand(input: string): ParsedCommand | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith('/')) return null;
  const parts = trimmed
    .slice(1)
    .split(/\s+/)
    .filter((p) => p.length > 0);
  if (!parts.length) return null;
  const [name, ...args] = parts;
  return { name: name.toLowerCase(), args, raw: trimmed };
}

/** Résout les aliases (/mem → memory, /tasks → task). */
export function resolveCommand(name: string): CommandDef | undefined {
  return FORGE_COMMANDS.find(
    (c) => c.name === name || c.aliases?.includes(name),
  );
}

/** Suggestions de complétion quand l'utilisateur tape `/xxx` sans espace. */
export function getSuggestions(input: string): CommandDef[] {
  if (!input.startsWith('/')) return [];
  const query = input.slice(1).split(/\s/)[0].toLowerCase();
  if (!query) return FORGE_COMMANDS;
  return FORGE_COMMANDS.filter(
    (c) =>
      c.name.startsWith(query) ||
      c.aliases?.some((a) => a.startsWith(query)),
  );
}
