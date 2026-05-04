/**
 * Consigne commune pour les prompts agents — carnet de bord & API tâches Forge.
 * Utilisée par la page Instructions (UI).
 */

export const FORGE_AGENT_PROTOCOL_TITLE = 'Protocole Forge — carnet de bord et clôture des tâches';

/** Version courte pour une phrase d’introduction (SSR). */
export const FORGE_AGENT_PROTOCOL_SUMMARY =
  'Forge exécute les tâches via son orchestrateur interne et met à jour AgentTask directement avec la réponse de l’agent.';

export type SwarmWorkCommand = 'start_work' | 'pause_work' | 'stop_work' | 'resume_work';

export const SWARM_WORK_COMMAND_LABELS: Record<SwarmWorkCommand, string> = {
  start_work: 'start work',
  pause_work: 'pause work',
  stop_work: 'stop work',
  resume_work: 'resume work',
};

export const SWARM_WORK_PROTOCOL_SUMMARY =
  'Commandes standard swarm: start work, pause work, resume work, stop work. Chaque agent répond avec état, prochaine action, blocage éventuel.';

export function buildSwarmWorkDirective(command: SwarmWorkCommand, mode: 'leader' | 'direct' = 'direct'): string {
  const label = SWARM_WORK_COMMAND_LABELS[command];
  if (mode === 'leader') {
    return [
      `[FORGE_SWARM_COMMAND] ${label}`,
      '',
      'Tu agis comme chef de swarm.',
      '- Diffuse la commande aux agents pertinents selon leur rôle.',
      '- Rassemble un état court par agent: running | paused | stopped.',
      '- Retourne un plan d’action synthétique (max 6 points).',
      '- Si une information manque, pose une seule question bloquante.',
    ].join('\n');
  }
  return [
    `[FORGE_SWARM_COMMAND] ${label}`,
    '',
    'Applique la commande immédiatement selon ton rôle.',
    'Réponds au format:',
    '- état: running|paused|stopped',
    '- prochaine_action: ...',
    '- blocage: aucun|...',
    '- besoin_chef: oui|non',
  ].join('\n');
}
