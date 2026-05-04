/**
 * Contrat d’intégration Forge / infra ZimaOS-NAS.
 *
 * Forge reste la source de vérité pour : instructions agents, missions (AgentTask), projets,
 * configuration, budgets stockés, profils UI, orchestration « métier ».
 *
 * ZimaOS/NAS ne doit intervenir que pour l’infrastructure : dossiers d’applications,
 * montages, conteneurs Docker, accès SSH et vérifications système.
 *
 * Les agents, tâches et sous-agents doivent rester pilotés par Forge avec Ollama.
 */

/** Rôles légitimes de l’infra ZimaOS/NAS. */
export const ZIMAOS_RUNTIME_ROLES = [
  'Dossiers d’applications et racines de travail sur le NAS',
  'Conteneurs Docker, volumes et montages à inspecter',
  'Accès SSH distant quand Forge n’est pas sur la même machine',
  'Sondes santé infra liées au conteneur / NAS',
] as const;

/** Ce qui doit rester entièrement côté Forge (pas de dépendance gateway pour la persistance). */
export const FORGE_NATIVE_ROLES = [
  'Tables Astro DB : AgentInstruction, AgentTask, Project, Config, ForgeChatSession, ForgeChatMessage',
  'Pages UI et formulaires (swarm, agents, réglages)',
  'Orchestration agents et sous-agents via forge-work-scheduler, forge-orchestrator et Ollama',
] as const;

/**
 * Modules « façade » autorisés pour isoler les appels infra hérités.
 */
export const FORGE_FACADES_OVER_ZIMAOS = ['lib/zimaos-gateway.ts', 'pages/api/zimaos-*.ts'] as const;
