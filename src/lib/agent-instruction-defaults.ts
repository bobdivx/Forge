/**
 * Liste des agents OpenClaw — utilisée par le seed DB et le bootstrap lazy de /api/agent-instructions.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { getForgeRepoRoot } from './forge-repo-root';

export const FORGE_AGENT_INSTRUCTION_ROWS = [
  { agentId: 'CHEF_TECHNIQUE',      model: 'qwen2.5:32b',      filePath: 'instructions/SOUL.md' },
  { agentId: 'ARCHITECTE_LOGICIEL', model: 'qwen2.5:32b',      filePath: 'instructions/agents/ARCHITECTE_LOGICIEL.md' },
  { agentId: 'DEV_BACKEND',         model: 'qwen2.5-coder:7b', filePath: 'instructions/agents/DEV_BACKEND.md' },
  { agentId: 'DEV_FRONTEND',        model: 'qwen2.5-coder:7b', filePath: 'instructions/agents/DEV_FRONTEND.md' },
  { agentId: 'EXPERT_GITHUB',       model: 'mistral:7b',       filePath: 'instructions/agents/EXPERT_GITHUB.md' },
  { agentId: 'ANALYSTE_CODE',       model: 'llama3.1:8b',      filePath: 'instructions/agents/ANALYSTE_CODE.md' },
  { agentId: 'TESTEUR_QA',          model: 'llama3.1:8b',      filePath: 'instructions/agents/TESTEUR_QA.md' },
  { agentId: 'INFRA_TECH',          model: 'qwen2.5-coder:7b', filePath: 'instructions/agents/INFRA_TECH.md' },
  { agentId: 'SECURITE_CODE',       model: 'llama3.1:8b',      filePath: 'instructions/agents/SECURITE_CODE.md' },
  { agentId: 'INGENIEUR_HARDWARE',  model: 'llama3.1:8b',      filePath: 'instructions/agents/INGENIEUR_HARDWARE.md' },
  { agentId: 'INGENIEUR_PROMPT',    model: 'llama3.1:8b',      filePath: 'instructions/agents/INGENIEUR_PROMPT.md' },
  { agentId: 'MAINTENANCE_REPO',    model: 'mistral:7b',       filePath: 'instructions/agents/MAINTENANCE_REPO.md' },
  { agentId: 'REDACTEUR_DOC',       model: 'mistral:7b',       filePath: 'instructions/agents/REDACTEUR_DOC.md' },
  { agentId: 'SCRIPTEUR_AUTOMATE',  model: 'qwen2.5-coder:7b', filePath: 'instructions/agents/SCRIPTEUR_AUTOMATE.md' },
  { agentId: 'VEILLE_TECH',         model: 'llama3.1:8b',      filePath: 'instructions/agents/VEILLE_TECH.md' },
] as const;

export function readInstructionMdFromRepo(relativePath: string): string {
  const repoRoot = getForgeRepoRoot();
  const fullPath = resolve(repoRoot, relativePath);
  if (!existsSync(fullPath)) return `# ${relativePath}\n\nFichier absent sur le serveur.`;
  return readFileSync(fullPath, 'utf-8');
}
