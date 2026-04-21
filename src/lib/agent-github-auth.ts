export function isGithubAutomationAgent(agentId: string): boolean {
  const id = String(agentId || '').trim().toUpperCase();
  if (!id) return false;
  if (id === 'EXPERT_GITHUB') return true;
  return id.startsWith('EXPERT_GITHUB__APP_');
}

