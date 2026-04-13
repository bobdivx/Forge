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
 * Comptes dashboard (email = clé primaire).
 * Nom exporté `ForgeUser` : évite le conflit avec l’identifiant `User` du module virtuel `astro:db`
 * (sinon `User` est `undefined` → erreur Drizzle « Symbol(drizzle:Columns) »).
 */
const ForgeUser = defineTable({
  columns: {
    email: column.text({ primaryKey: true }),
    salt: column.text(),
    passwordHash: column.text(),
    createdAt: column.date({ default: new Date() }),
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

/**
 * Jetons API nommés (clé stable type STRIPE_LIVE) pour les agents.
 * Les valeurs sont lues côté serveur via GET /api/agent-api-secrets (réseau local uniquement).
 */
const CustomApiToken = defineTable({
  columns: {
    id: column.number({ primaryKey: true }),
    /** Clé d’accès pour les scripts / agents (ex. ANTHROPIC_API_KEY). */
    key: column.text(),
    /** Libellé affiché dans le dashboard (optionnel). */
    label: column.text({ optional: true }),
    secret: column.text(),
    createdAt: column.date({ default: new Date() }),
    updatedAt: column.date({ default: new Date() }),
  },
});

/**
 * Anomalies pages / build / 404 remontées par les agents (ex. DEV_FRONTEND).
 * Statuts : open | in_progress | resolved | wont_fix
 */
const AgentAppIssue = defineTable({
  columns: {
    id: column.number({ primaryKey: true }),
    projectId: column.number({ optional: true, references: () => Project.columns.id }),
    url: column.text(),
    errorType: column.text(),
    title: column.text(),
    detail: column.text({ optional: true }),
    status: column.text({ default: 'open' }),
    reportedByAgentId: column.text(),
    assigneeAgentId: column.text({ optional: true }),
    createdAt: column.date({ default: new Date() }),
    updatedAt: column.date({ default: new Date() }),
  },
});

/**
 * Demandes d’installation de dépendances (npm/pnpm) entre agents.
 * Statuts : open | in_progress | installed | rejected
 */
const AgentDependencyRequest = defineTable({
  columns: {
    id: column.number({ primaryKey: true }),
    projectId: column.number({ optional: true, references: () => Project.columns.id }),
    packageName: column.text(),
    versionSpec: column.text({ optional: true }),
    isDev: column.number({ default: 0 }),
    reason: column.text({ optional: true }),
    status: column.text({ default: 'open' }),
    requestedByAgentId: column.text(),
    assigneeAgentId: column.text({ optional: true }),
    createdAt: column.date({ default: new Date() }),
    updatedAt: column.date({ default: new Date() }),
  },
});

/**
 * Plages horaires de travail automatique du swarm.
 * Quand le système de travail est actif (enabled=1), le scheduler interne
 * lance/arrête les agents selon les jours et heures configurés.
 */
const WorkSchedule = defineTable({
  columns: {
    id: column.number({ primaryKey: true }),
    /** Libellé affiché (ex: "Semaine", "Week-end"). */
    label: column.text({ default: 'Horaires de travail' }),
    /** Jours actifs — JSON array de 0-6 (0=dim, 1=lun, …, 6=sam). Ex: "[1,2,3,4,5]" */
    days: column.text({ default: '[1,2,3,4,5]' }),
    /** Heure de début au format "HH:MM". */
    startTime: column.text({ default: '09:00' }),
    /** Heure de fin au format "HH:MM". */
    endTime: column.text({ default: '18:00' }),
    /** Agents concernés — JSON array d'agentId. Vide = tous les agents. */
    agentIds: column.text({ default: '[]' }),
    /** 1 = cette plage est active, 0 = désactivée. */
    enabled: column.number({ default: 1 }),
    updatedAt: column.date({ default: new Date() }),
  },
});

export default defineDb({
  tables: {
    Project,
    AppData,
    Heartbeat,
    AgentTask,
    AgentMessage,
    Request,
    Config,
    ForgeUser,
    AgentMemory,
    AgentInstruction,
    CustomApiToken,
    AgentAppIssue,
    AgentDependencyRequest,
    WorkSchedule,
  },
});
