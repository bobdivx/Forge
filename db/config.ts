import { defineDb, defineTable, column } from 'astro:db';

const Project = defineTable({
  columns: {
    id: column.number({ primaryKey: true }),
    name: column.text(),
    description: column.text({ optional: true }),
    path: column.text(),
    status: column.text({ default: 'active' }),
    swarmEnabled: column.number({ default: 1 }),
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
    projectId: column.number({ optional: true, references: () => Project.columns.id }),
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
    /** Agent ZimaOS cible (sinon déduit du type de demande). */
    assigneeAgentId: column.text({ optional: true }),
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
 * Un enregistrement = un agent ZimaOS. Le fichier .md correspondant est
 * regénéré via POST /api/sync-agents.
 */
const AgentInstruction = defineTable({
  columns: {
    /** Identifiant ZimaOS (ex: "DEV_FRONTEND", "CHEF_TECHNIQUE"). */
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

/**
 * Catalogue local des modèles utilisables pour les agents Forge.
 * Sert de source stable quand ZimaOS est indisponible.
 */
const AgentModel = defineTable({
  columns: {
    /** Identifiant modèle (ex: qwen3-coder:30b). */
    id: column.text({ primaryKey: true }),
    /** Libellé affiché dans les sélecteurs. */
    label: column.text(),
    /** Origine du modèle: local | zimaos | seed. */
    source: column.text({ default: 'seed' }),
    /** 1 = visible dans les UI, 0 = masqué. */
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

/**
 * Événements de coût générés par les agents (inspiré de Paperclip cost_events).
 * Chaque appel LLM produit un enregistrement avec tokens et coût en centimes.
 */
const CostEvent = defineTable({
  columns: {
    id: column.number({ primaryKey: true }),
    /** Identifiant de l'agent ayant généré la dépense. */
    agentId: column.text(),
    /** Tâche associée (optionnel). */
    taskId: column.number({ optional: true }),
    /** Fournisseur LLM : ollama | openai | anthropic | gemini */
    provider: column.text({ default: 'ollama' }),
    /** Modèle utilisé (ex: qwen2.5-coder, gemini-2.0-flash). */
    model: column.text(),
    /** Tokens en entrée. */
    inputTokens: column.number({ default: 0 }),
    /** Tokens en sortie. */
    outputTokens: column.number({ default: 0 }),
    /** Coût en centimes (0 pour modèles locaux Ollama). */
    costCents: column.number({ default: 0 }),
    /** Horodatage de l'événement. */
    occurredAt: column.date({ default: new Date() }),
  },
});

/**
 * Budget mensuel par agent (inspiré de Paperclip budget enforcement).
 * Un enregistrement par agentId. Le système auto-pause l'agent si hardStop=1
 * et que spentThisMonth >= monthlyCents.
 */
const AgentBudget = defineTable({
  columns: {
    /** Identifiant agent (clé primaire). */
    agentId: column.text({ primaryKey: true }),
    /** Budget mensuel en centimes (0 = illimité). */
    monthlyCents: column.number({ default: 0 }),
    /** Dépenses du mois en cours en centimes. */
    spentThisMonth: column.number({ default: 0 }),
    /** Seuil d'alerte douce (80 = 80%). */
    alertThreshold: column.number({ default: 80 }),
    /** 1 = stopper automatiquement l'agent à 100% du budget. */
    hardStop: column.number({ default: 0 }),
    /** Date de remise à zéro mensuelle. */
    resetAt: column.date({ optional: true }),
    /** 1 = budget actif, 0 = budget ignoré. */
    enabled: column.number({ default: 1 }),
    updatedAt: column.date({ default: new Date() }),
  },
});

/**
 * Journal d'audit global — toute action mutante est enregistrée ici.
 * Inspiré de Paperclip activity_log. Permet la traçabilité complète.
 */
const ActivityLog = defineTable({
  columns: {
    id: column.number({ primaryKey: true }),
    /** Type d'acteur : agent | user | system */
    actorType: column.text({ default: 'system' }),
    /** Identifiant de l'acteur. */
    actorId: column.text(),
    /** Action effectuée (ex: approval.approved, agent.paused, cost.ingested). */
    action: column.text(),
    /** Type d'entité concernée (ex: approval, agent, task). */
    entityType: column.text(),
    /** Identifiant de l'entité. */
    entityId: column.text(),
    /** Détails JSON optionnels. */
    details: column.text({ optional: true }),
    createdAt: column.date({ default: new Date() }),
  },
});

/**
 * Runs heartbeat enrichis (inspiré de Paperclip heartbeat_runs).
 * Remplace la table Heartbeat basique avec statuts complets et métriques.
 */
const HeartbeatRun = defineTable({
  columns: {
    id: column.number({ primaryKey: true }),
    /** Agent invoqué. */
    agentId: column.text(),
    /** Source d'invocation : scheduler | manual | callback */
    source: column.text({ default: 'scheduler' }),
    /** Statut : queued | running | succeeded | failed | cancelled | timed_out */
    status: column.text({ default: 'queued' }),
    /** Début d'exécution. */
    startedAt: column.date({ optional: true }),
    /** Fin d'exécution. */
    finishedAt: column.date({ optional: true }),
    /** Durée en ms. */
    durationMs: column.number({ optional: true }),
    /** Message d'erreur si failed. */
    error: column.text({ optional: true }),
    /** ID de run externe (ZimaOS session id). */
    externalRunId: column.text({ optional: true }),
    createdAt: column.date({ default: new Date() }),
  },
});

/**
 * Fiches « membre d’équipe » pour les **sessions ZimaOS** (clé = sessionKey renvoyée par le gateway).
 * Les champs sont optionnels : si vides, l’UI retombe sur l’inférence (nom brut, rôle, initiales).
 */
const ZimaOSAgentProfile = defineTable({
  columns: {
    /** Clé de session ZimaOS (identifiant unique côté gateway, ex. CHEF_TECHNIQUE ou clé longue). */
    sessionKey: column.text({ primaryKey: true }),
    /** Nom affiché dans Forge (remplace le nom dérivé ZimaOS). */
    displayName: column.text({ optional: true }),
    /** Titre de rôle affiché (remplace l’inférence depuis le nom / modèle). */
    roleTitle: column.text({ optional: true }),
    /** Courte bio / note d’équipe (Markdown simple ou texte). */
    bio: column.text({ optional: true }),
    /** URL HTTPS d’avatar (optionnel). */
    avatarUrl: column.text({ optional: true }),
    /** Émoji d’avatar (optionnel, ex. 🤖) — utilisé si pas d’URL. */
    avatarEmoji: column.text({ optional: true }),
    updatedAt: column.date({ default: new Date() }),
  },
});

/**
 * Sessions conversationnelles natives Forge (découplées du gateway conversationnel ZimaOS).
 */
const ForgeChatSession = defineTable({
  columns: {
    id: column.text({ primaryKey: true }),
    agentId: column.text(),
    projectId: column.number({ optional: true, references: () => Project.columns.id }),
    requestId: column.number({ optional: true, references: () => Request.columns.id }),
    title: column.text({ optional: true }),
    status: column.text({ default: 'active' }),
    createdAt: column.date({ default: new Date() }),
    updatedAt: column.date({ default: new Date() }),
  },
});

/**
 * Messages conversationnels Forge (chat user/assistant/system).
 */
const ForgeChatMessage = defineTable({
  columns: {
    id: column.number({ primaryKey: true }),
    sessionId: column.text(),
    role: column.text(),
    content: column.text(),
    provider: column.text({ optional: true }),
    model: column.text({ optional: true }),
    meta: column.text({ optional: true }),
    createdAt: column.date({ default: new Date() }),
  },
});

/**
 * Traces d’étapes d’orchestration Forge (sous-agents, outils, décisions).
 */
const ForgeChatStep = defineTable({
  columns: {
    id: column.number({ primaryKey: true }),
    sessionId: column.text(),
    type: column.text(),
    label: column.text(),
    payload: column.text({ optional: true }),
    status: column.text({ default: 'completed' }),
    createdAt: column.date({ default: new Date() }),
  },
});

/**
 * Demandes d’approbation (Human-in-the-Loop) — inspirées de Paperclip.
 * Les agents peuvent soumettre une demande qui bloque une action critique.
 * Statuts : pending | approved | rejected
 */
const Approval = defineTable({
  columns: {
    id: column.number({ primaryKey: true }),
    agentId: column.text(),
    /** hire | dep | budget | policy | code_change | generic */
    type: column.text({ default: 'generic' }),
    title: column.text(),
    /** Données JSON structurées de la demande. */
    payload: column.text({ optional: true }),
    status: column.text({ default: 'pending' }),
    feedback: column.text({ optional: true }),
    createdAt: column.date({ default: new Date() }),
    updatedAt: column.date({ default: new Date() }),
  },
});

/**
 * Instances Ollama distantes ou locales.
 * Permet de gérer plusieurs déploiements (NAS, PC Windows, etc.).
 */
const OllamaInstance = defineTable({
  columns: {
    id: column.number({ primaryKey: true }),
    /** Nom libellé (ex: "ZimaCube NAS", "PC Gaming"). */
    name: column.text(),
    /** URL de base (ex: http://10.1.0.58:38197). */
    url: column.text(),
    /** Jeton d'authentification optionnel. */
    apiKey: column.text({ optional: true }),
    /** 1 = active, 0 = ignorée. */
    enabled: column.number({ default: 1 }),
    createdAt: column.date({ default: new Date() }),
    updatedAt: column.date({ default: new Date() }),
  },
});

/**
 * Valeurs de listes pour le Rule Builder (frameworks, UI libs, langues, qualité...).
 */
const AgentRuleOption = defineTable({
  columns: {
    id: column.number({ primaryKey: true }),
    /** Catégorie visible dans l'UI: framework | ui | language | reporting | quality */
    category: column.text(),
    /** Type interne de liste: framework | component | css | ui_library | i18n | reporting_language | quality */
    kind: column.text(),
    /** Valeur persistée de l'option. */
    value: column.text(),
    /** Libellé affiché. */
    label: column.text(),
    /** 1 = visible, 0 = masqué. */
    enabled: column.number({ default: 1 }),
    /** Ordre d'affichage. */
    sortOrder: column.number({ default: 100 }),
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
    AgentModel,
    CustomApiToken,
    AgentAppIssue,
    AgentDependencyRequest,
    WorkSchedule,
    Approval,
    // Phase 1 — Paperclip-inspired features
    CostEvent,
    AgentBudget,
    ActivityLog,
    HeartbeatRun,
    ZimaOSAgentProfile,
    ForgeChatSession,
    ForgeChatMessage,
    ForgeChatStep,
    OllamaInstance,
    AgentRuleOption,
  },
});
