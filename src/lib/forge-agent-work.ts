/** Contrat statuts / types pour les tables AgentAppIssue et AgentDependencyRequest. */

export const APP_ISSUE_STATUSES = ['open', 'in_progress', 'resolved', 'wont_fix'] as const;
export type AppIssueStatus = (typeof APP_ISSUE_STATUSES)[number];

export const DEPENDENCY_STATUSES = ['open', 'in_progress', 'installed', 'rejected'] as const;
export type DependencyStatus = (typeof DEPENDENCY_STATUSES)[number];

export const APP_ERROR_TYPES = [
  'astro_error',
  'http_404',
  'build',
  'runtime',
  'visual',
  'other',
] as const;
export type AppErrorType = (typeof APP_ERROR_TYPES)[number];

export function normalizeAppIssueStatus(s: string): AppIssueStatus | null {
  const v = String(s).toLowerCase().trim();
  return (APP_ISSUE_STATUSES as readonly string[]).includes(v) ? (v as AppIssueStatus) : null;
}

export function normalizeDependencyStatus(s: string): DependencyStatus | null {
  const v = String(s).toLowerCase().trim();
  return (DEPENDENCY_STATUSES as readonly string[]).includes(v) ? (v as DependencyStatus) : null;
}

export function normalizeErrorType(s: string): AppErrorType {
  const v = String(s).toLowerCase().trim().replace(/\s+/g, '_');
  return (APP_ERROR_TYPES as readonly string[]).includes(v) ? (v as AppErrorType) : 'other';
}
