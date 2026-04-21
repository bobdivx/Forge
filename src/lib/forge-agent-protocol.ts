/**
 * Consigne commune pour les prompts agents — carnet de bord & API tâches Forge.
 * Utilisée par la page Instructions (UI) ; tu peux copier-coller dans OpenClaw.
 */

export const FORGE_AGENT_PROTOCOL_TITLE = 'Protocole Forge — carnet de bord et clôture des tâches';

/** Version courte pour une phrase d’introduction (SSR). */
export const FORGE_AGENT_PROTOCOL_SUMMARY =
  'Termine ta réponse par une ligne FORGE_DONE task=<id> status=completed|failed : Forge scanne OpenClaw et met à jour le carnet tout seul (plus besoin d’appeler l’API à la main).';
