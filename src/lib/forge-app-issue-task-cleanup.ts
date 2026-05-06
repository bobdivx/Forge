/**
 * Annulation des AgentTask encore en file et liées à une fiche AgentAppIssue
 * (titre aligné sur `dispatchOpenAppIssues` : « [AppIssue #id] … »).
 */
import { and, eq, or, sql } from 'drizzle-orm';
import { loadAstroDb } from './load-astro-db';

export async function cancelQueuedAgentTasksLinkedToAppIssue(issueId: number): Promise<void> {
  const { db, AgentTask } = await loadAstroDb();
  const pattern = `%[AppIssue #${issueId}]%`;
  await db
    .update(AgentTask)
    .set({ status: 'cancelled', updatedAt: new Date() })
    .where(
      and(
        or(eq(AgentTask.status, 'pending'), eq(AgentTask.status, 'bug')),
        sql`(coalesce(${AgentTask.task}, '') like ${pattern} or coalesce(${AgentTask.input}, '') like ${pattern})`,
      ),
    );
}
