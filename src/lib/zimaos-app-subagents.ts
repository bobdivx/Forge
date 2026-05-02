/**
 * @deprecated Ce fichier ne décrit pas une API ZimaOS : les agents projet sont gérés par Forge.
 * Import préféré : `./forge-project-scoped-agents`.
 */
export {
  FORGE_PROJECT_CHILD_TOKEN as SUBAGENT_TOKEN,
  ensureForgeProjectScopedAgent as ensureProjectScopedSubagent,
  cleanupIdleForgeProjectScopedAgents as cleanupIdleProjectScopedSubagents,
  parseForgeParentAgentId as parseParentAgentFromSubagentId,
  formatForgeProjectScopeLabel as extractProjectScopeLabel,
  listForgeProjectScopedChildAgents as listProjectScopedSubagentsForParent,
} from './forge-project-scoped-agents';
