/**
 * Contrat d’intégration Forge ↔ ZimaOS.
 *
 * Forge reste la source de vérité pour : instructions agents, missions (AgentTask), projets,
 * configuration, budgets stockés, profils UI, orchestration « métier ».
 *
 * ZimaOS (gateway sur le NAS) ne doit intervenir que pour ce qui nécessite le runtime distant :
 * exécution LLM, envoi de directives `sessions_send`, discovery modèles côté cluster,
 * sync fichier embarqué sur la machine ZimaOS, SSH/infra NAS si applicable.
 *
 * Tout nouveau code qui appelle le gateway doit passer par `zimaos-gateway.ts` ou les
 * routes `/api/zimaos-*` dédiées — éviter les fetch dispersés vers `ZIMAOS_GATEWAY_URL`.
 */

/** Rôles légitimes du runtime ZimaOS (exécution / NAS uniquement). */
export const ZIMAOS_RUNTIME_ROLES = [
  'Envoi de directives et chat agent (sessions_send, agents_invoke, /v1/chat/completions)',
  'Liste des sessions / état live pour affichage (quand le gateway répond)',
  'Synchronisation du fichier de config agents embarqué sur ZimaOS',
  'Sondes santé, sanity, provision SSH liées au conteneur / NAS',
] as const;

/** Ce qui doit rester entièrement côté Forge (pas de dépendance gateway pour la persistance). */
export const FORGE_NATIVE_ROLES = [
  'Tables Astro DB : AgentInstruction, AgentTask, Project, Config, ZimaOSAgentProfile (métadonnées)',
  'Pages UI et formulaires (swarm, agents, réglages)',
  'Orchestration planifiable (forge-work-scheduler) qui décide quoi envoyer — le « quoi » est en DB',
] as const;

/**
 * Modules « façade » qui encapsulent le gateway pour les pages produit (préférer ces
 * imports aux appels directs depuis les `.astro` / composants).
 */
export const FORGE_FACADES_OVER_ZIMAOS = ['lib/forge-swarm-page-sessions.ts', 'lib/redispatch-mission-task.ts'] as const;
