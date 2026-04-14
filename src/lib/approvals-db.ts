import { loadAstroDb } from './load-astro-db';

export type ApprovalType = 'hire' | 'dep' | 'budget' | 'policy' | 'code_change' | 'generic';
export type ApprovalStatus = 'pending' | 'approved' | 'rejected';

export async function createApproval(params: {
  agentId: string;
  type: ApprovalType;
  title: string;
  payload?: any;
}) {
  const { db, Approval, ActivityLog } = await loadAstroDb();
  const payloadStr = params.payload ? JSON.stringify(params.payload) : null;
  const now = new Date();

  const result = await db.insert(Approval).values({
    agentId: params.agentId,
    type: params.type,
    title: params.title,
    payload: payloadStr,
    status: 'pending',
    createdAt: now,
    updatedAt: now,
  });

  // Audit log — demande créée
  await db.insert(ActivityLog).values({
    actorType: 'agent',
    actorId: params.agentId,
    action: 'approval.requested',
    entityType: 'approval',
    entityId: String(params.agentId),
    details: JSON.stringify({ type: params.type, title: params.title }),
    createdAt: now,
  });

  return result;
}

export async function resolveApproval(id: number, status: ApprovalStatus, feedback?: string) {
  const { db, Approval, ActivityLog, eq } = await loadAstroDb();
  const now = new Date();

  await db.update(Approval)
    .set({
      status,
      feedback: feedback || null,
      updatedAt: now,
    })
    .where(eq(Approval.id, id));

  // Audit log — décision enregistrée
  await db.insert(ActivityLog).values({
    actorType: 'user',
    actorId: 'board',
    action: `approval.${status}`,
    entityType: 'approval',
    entityId: String(id),
    details: feedback ? JSON.stringify({ feedback }) : null,
    createdAt: now,
  });
}

export async function getPendingApprovals() {
  const { db, Approval, eq, desc } = await loadAstroDb();
  return await db.select().from(Approval).where(eq(Approval.status, 'pending')).orderBy(desc(Approval.createdAt));
}
