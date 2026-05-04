/**
 * Liste des agents Forge — utilisée par le seed DB.
 * La source de vérité est désormais la table `AgentInstruction` dans Astro DB.
 */

export const FORGE_AGENT_INSTRUCTION_ROWS = [
  { agentId: 'CHEF_TECHNIQUE',      model: 'qwen3-coder:30b',  description: 'Coordonne le swarm et valide les décisions techniques.' },
  { agentId: 'ARCHITECTE_LOGICIEL', model: 'qwen3-coder:30b',  description: 'Définit l\'architecture, les schémas DB et les patterns de code.' },
  { agentId: 'DEV_BACKEND',         model: 'qwen2.5:7b',       description: 'Implémente la logique serveur, les API et l\'intégration DB.' },
  { agentId: 'DEV_FRONTEND',        model: 'qwen2.5:7b',       description: 'Conçoit les interfaces utilisateur avec Astro et Preact.' },
  { agentId: 'EXPERT_GITHUB',       model: 'gemma4:latest',    description: 'Gère le cycle de vie GitHub, les PR et les actions CI/CD.' },
  { agentId: 'ANALYSTE_CODE',       model: 'llama3.2:latest',  description: 'Audite le code existant pour détecter les bugs et les dettes.' },
  { agentId: 'TESTEUR_QA',          model: 'qwen2.5:7b',       description: 'Vérifie la qualité et écrit les tests automatisés.' },
  { agentId: 'INFRA_TECH',          model: 'qwen2.5:7b',       description: 'Gère le déploiement Docker et l\'infrastructure NAS.' },
  { agentId: 'SECURITE_CODE',       model: 'llama3.2:latest',  description: 'Analyse les vulnérabilités et renforce la sécurité.' },
  { agentId: 'INGENIEUR_HARDWARE',  model: 'gemma4:latest',    description: 'Spécialiste de l\'intégration matérielle (NAS/ZimaOS).' },
  { agentId: 'INGENIEUR_PROMPT',    model: 'llama3.2:latest',  description: 'Optimise les instructions et le comportement des agents.' },
  { agentId: 'MAINTENANCE_REPO',    model: 'gemma4:latest',    description: 'Nettoie les dépendances et maintient les dépôts sains.' },
  { agentId: 'REDACTEUR_DOC',       model: 'gemma4:latest',    description: 'Rédige la documentation technique et fonctionnelle.' },
  { agentId: 'SCRIPTEUR_AUTOMATE',  model: 'qwen2.5:7b',       description: 'Développe des scripts d\'automatisation interne.' },
  { agentId: 'VEILLE_TECH',         model: 'llama3.2:latest',  description: 'Explore les projets et propose des évolutions proactives.' },
] as const;

export const FORGE_SWARM_AGENT_COUNT = FORGE_AGENT_INSTRUCTION_ROWS.length;

const DISCOVERY_EXTRA: Partial<Record<string, string>> = {
  VEILLE_TECH:
    '\n\n**Mode découverte :** parcours les dépôts swarm (chemins indiqués par la session) et signale toute évolution utile. Utilise `audit_project` puis `propose_improvement` / `propose_bug` quand c’est pertinent (reste sobre, quotas appliqués).',
  ANALYSTE_CODE:
    '\n\n**Mode audit :** inspecte le code (lecture ciblée, smells, null deref) et matérialise les découvertes via `propose_bug` / `propose_improvement` plutôt que de seulement les décrire en texte libre.',
  SECURITE_CODE:
    '\n\n**Mode sécurité :** cherche secrets, XSS, SQLi, auth faible. Exploite `audit_project` (scope security) et remonte via `propose_bug` / `propose_improvement` si le risque est réel.',
  MAINTENANCE_REPO:
    '\n\n**Mode maintenance :** dépendances obsolètes, dette, scripts cassés. Documente et appelle `propose_bug` / `propose_improvement` quand la correction est claire.',
};

export function getInitialSystemPrompt(agentId: string): string {
  const agent = FORGE_AGENT_INSTRUCTION_ROWS.find((a) => a.agentId === agentId);
  const extra = DISCOVERY_EXTRA[agentId] || '';
  return (
    `# Identité : ${agentId}\n\n${agent?.description || 'Agent spécialisé Forge.'}\n\n` +
    `Mission : accomplir les tâches assignées en respectant les règles définies dans le dashboard (Politique Agents).` +
    extra
  );
}

