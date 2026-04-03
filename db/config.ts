import { defineDb, defineTable, column } from 'astro:db';

const Project = defineTable({
  columns: {
    id: column.number({ primaryKey: true }),
    name: column.text(),
    description: column.text({ optional: true }),
    path: column.text(),
    status: column.text({ default: 'active' }),
    createdAt: column.date({ default: new Date() }),
    updatedAt: column.date({ default: new Date() }),
  },
});

const AppData = defineTable({
  columns: {
    id: column.number({ primaryKey: true }),
    appName: column.text(),
    composePath: column.text(),
    dataDir: column.text(),
    status: column.text(),
    lastBackup: column.date({ optional: true }),
  },
});

const Heartbeat = defineTable({
  columns: {
    id: column.number({ primaryKey: true }),
    timestamp: column.date({ default: new Date() }),
    level: column.text(),
    message: column.text(),
    source: column.text(),
  },
});

const AgentTask = defineTable({
  columns: {
    id: column.number({ primaryKey: true }),
    agentId: column.text(),
    task: column.text(),
    input: column.text({ optional: true }),
    output: column.text({ optional: true }),
    status: column.text({ default: 'pending' }),
    createdAt: column.date({ default: new Date() }),
    updatedAt: column.date({ default: new Date() }),
  },
});

const AgentMessage = defineTable({
  columns: {
    id: column.number({ primaryKey: true }),
    fromAgent: column.text(),
    toAgent: column.text({ optional: true }),
    content: column.text(),
    timestamp: column.date({ default: new Date() }),
  },
});

const Request = defineTable({
  columns: {
    id: column.number({ primaryKey: true }),
    projectId: column.number({ references: () => Project.columns.id }),
    title: column.text(),
    content: column.text(),
    /** pending | in_progress | completed | rejected */
    status: column.text({ default: 'pending' }),
    priority: column.text({ default: 'medium' }),
    author: column.text({ default: 'Mathieu' }),
    /** Fonctionnalite | Correction */
    requestType: column.text({ optional: true }),
    createdAt: column.date({ default: new Date() }),
    updatedAt: column.date({ default: new Date() }),
  },
});

const Config = defineTable({
  columns: {
    key: column.text({ primaryKey: true }),
    value: column.text(),
    updatedAt: column.date({ default: new Date() }),
  },
});

/**
 * Instructions système des agents — source de vérité gérée via le dashboard.
 * Un enregistrement = un agent OpenClaw. Le fichier .md correspondant est
 * regénéré via POST /api/sync-agents.
 */
const AgentInstruction = defineTable({
  columns: {
    /** Identifiant OpenClaw (ex: "DEV_FRONTEND", "CHEF_TECHNIQUE"). */
    agentId: column.text({ primaryKey: true }),
    /** Modèle Ollama utilisé par cet agent. */
    model: column.text(),
    /** Chemin du fichier .md généré, relatif à la racine du repo Forge. */
    filePath: column.text(),
    /** Contenu complet du system prompt (markdown). */
    systemPrompt: column.text(),
    /** L'agent est-il activé dans le swarm. */
    enabled: column.number({ default: 1 }),
    updatedAt: column.date({ default: new Date() }),
  },
});

/** Mémoire persistante par agent — inspirée du pattern memdir/ de Claude Code. */
const AgentMemory = defineTable({
  columns: {
    id: column.number({ primaryKey: true }),
    /** Identifiant de l'agent propriétaire de cette mémoire. */
    agentId: column.text(),
    /** Contenu de la mémoire (texte libre). */
    content: column.text(),
    /** Tags JSON optionnels (ex: '["astro","preact"]'). */
    tags: column.text({ optional: true }),
    createdAt: column.date({ default: new Date() }),
  },
});

export default defineDb({
  tables: { Project, AppData, Heartbeat, AgentTask, AgentMessage, Request, Config, AgentMemory, AgentInstruction }
});
