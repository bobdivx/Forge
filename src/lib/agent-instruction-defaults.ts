/**
 * Liste des agents ZimaOS — utilisée par le seed DB et le bootstrap lazy de /api/agent-instructions.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { getForgeRepoRoot } from './forge-repo-root';

function toDocPath(relativePath: string): string {
  const normalized = String(relativePath || '').replace(/\\/g, '/');
  if (normalized.startsWith('instructions/agents/apps/')) {
    return normalized.replace(/^instructions\/agents\/apps\//, 'doc/agents/apps/');
  }
  if (normalized.startsWith('instructions/agents/')) {
    return normalized.replace(/^instructions\/agents\//, 'doc/agents/');
  }
  if (normalized === 'instructions/SOUL.md') return 'doc/prompts/SOUL.md';
  if (normalized === 'instructions/PROMPT_MAITRE.md') return 'doc/prompts/PROMPT_MAITRE.md';
  if (normalized === 'instructions/PROMPT_INIT_ASTRO_SSR.md') return 'doc/prompts/PROMPT_INIT_ASTRO_SSR.md';
  if (normalized === 'instructions/PORTS_ET_DEMARRAGE.md') return 'doc/PORTS_ET_DEMARRAGE.md';
  if (normalized === 'instructions/FORGE_API_CONTRACT.md') return 'doc/FORGE_API_CONTRACT.md';
  if (normalized === 'instructions/HEARTBEAT.md') return 'doc/HEARTBEAT.md';
  if (normalized.startsWith('instructions/')) {
    return normalized.replace(/^instructions\//, 'doc/');
  }
  return normalized;
}

function legacyInstructionPath(relativePath: string): string {
  const normalized = String(relativePath || '').replace(/\\/g, '/');
  if (normalized.startsWith('doc/agents/apps/')) {
    return normalized.replace(/^doc\/agents\/apps\//, 'instructions/agents/apps/');
  }
  if (normalized.startsWith('doc/agents/')) {
    return normalized.replace(/^doc\/agents\//, 'instructions/agents/');
  }
  if (normalized === 'doc/prompts/SOUL.md') return 'instructions/SOUL.md';
  if (normalized === 'doc/prompts/PROMPT_MAITRE.md') return 'instructions/PROMPT_MAITRE.md';
  if (normalized === 'doc/prompts/PROMPT_INIT_ASTRO_SSR.md') return 'instructions/PROMPT_INIT_ASTRO_SSR.md';
  if (normalized === 'doc/PORTS_ET_DEMARRAGE.md') return 'instructions/PORTS_ET_DEMARRAGE.md';
  if (normalized === 'doc/FORGE_API_CONTRACT.md') return 'instructions/FORGE_API_CONTRACT.md';
  if (normalized === 'doc/HEARTBEAT.md') return 'instructions/HEARTBEAT.md';
  if (normalized.startsWith('doc/')) {
    return normalized.replace(/^doc\//, 'instructions/');
  }
  return normalized;
}

export const FORGE_AGENT_INSTRUCTION_ROWS = [
  { agentId: 'CHEF_TECHNIQUE',      model: 'qwen3-coder:30b',  filePath: 'doc/prompts/SOUL.md' },
  { agentId: 'ARCHITECTE_LOGICIEL', model: 'qwen3-coder:30b',  filePath: 'doc/agents/ARCHITECTE_LOGICIEL.md' },
  { agentId: 'DEV_BACKEND',         model: 'qwen2.5:7b',       filePath: 'doc/agents/DEV_BACKEND.md' },
  { agentId: 'DEV_FRONTEND',        model: 'qwen2.5:7b',       filePath: 'doc/agents/DEV_FRONTEND.md' },
  { agentId: 'EXPERT_GITHUB',       model: 'gemma4:latest',    filePath: 'doc/agents/EXPERT_GITHUB.md' },
  { agentId: 'ANALYSTE_CODE',       model: 'llama3.2:latest',  filePath: 'doc/agents/ANALYSTE_CODE.md' },
  { agentId: 'TESTEUR_QA',          model: 'qwen2.5:7b',       filePath: 'doc/agents/TESTEUR_QA.md' },
  { agentId: 'INFRA_TECH',          model: 'qwen2.5:7b',       filePath: 'doc/agents/INFRA_TECH.md' },
  { agentId: 'SECURITE_CODE',       model: 'llama3.2:latest',  filePath: 'doc/agents/SECURITE_CODE.md' },
  { agentId: 'INGENIEUR_HARDWARE',  model: 'gemma4:latest',    filePath: 'doc/agents/INGENIEUR_HARDWARE.md' },
  { agentId: 'INGENIEUR_PROMPT',    model: 'llama3.2:latest',  filePath: 'doc/agents/INGENIEUR_PROMPT.md' },
  { agentId: 'MAINTENANCE_REPO',    model: 'gemma4:latest',    filePath: 'doc/agents/MAINTENANCE_REPO.md' },
  { agentId: 'REDACTEUR_DOC',       model: 'gemma4:latest',    filePath: 'doc/agents/REDACTEUR_DOC.md' },
  { agentId: 'SCRIPTEUR_AUTOMATE',  model: 'qwen2.5:7b',       filePath: 'doc/agents/SCRIPTEUR_AUTOMATE.md' },
  { agentId: 'VEILLE_TECH',         model: 'llama3.2:latest',  filePath: 'doc/agents/VEILLE_TECH.md' },
] as const;

/** Toujours égal au nombre de lignes ci-dessus (vérification / comparaison avec `agents_list` ZimaOS). */
export const FORGE_SWARM_AGENT_COUNT = FORGE_AGENT_INSTRUCTION_ROWS.length;

export function readInstructionMdFromRepo(relativePath: string): string {
  const repoRoot = getForgeRepoRoot();
  const docPath = toDocPath(relativePath);
  const fullDocPath = resolve(repoRoot, docPath);
  if (existsSync(fullDocPath)) return readFileSync(fullDocPath, 'utf-8');

  const legacyPath = legacyInstructionPath(docPath);
  const fullLegacyPath = resolve(repoRoot, legacyPath);
  if (existsSync(fullLegacyPath)) return readFileSync(fullLegacyPath, 'utf-8');

  return `# ${docPath}\n\nFichier absent sur le serveur (migration doc/instructions incomplète).`;
}
