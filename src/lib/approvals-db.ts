import { loadAstroDb } from './load-astro-db';

export type ApprovalType = 'hire' | 'dep' | 'budget' | 'policy' | 'code_change' | 'generic';
export type ApprovalStatus = 'pending' | 'approved' | 'rejected';

export async function createApproval(params: {
  agentId: string;
  type: ApprovalType;
  title: string;
  payload?: any;
}) {
  const { db, Approval } = await loadAstroDb();
  const payloadStr = params.payload ? JSON.stringify(params.payload) : null;

  return await db.insert(Approval).values({
    agentId: params.agentId,
    type: params.type,
    title: params.title,
    payload: payloadStr,
    status: 'pending',
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

export async function resolveApproval(id: number, status: ApprovalStatus, feedback?: string) {
  const { db, Approval, eq } = await loadAstroDb();
  
  await db.update(Approval)
    .set({ 
      status, 
      feedback: feedback || null,
      updatedAt: new Date() 
    })
    .where(eq(Approval.id, id));

  // Note: En mode "vrai OS", on déclencherait ici les effets de bord (ex: installer la lib si approved)
  // Pour l'instant on se contente de mettre à jour le statut pour que l'agent le contemple.
}

export async function getPendingApprovals() {
  const { db, Approval, eq, desc } = await loadAstroDb();
  return await db.select().from(Approval).where(eq(Approval.status, 'pending')).orderBy(desc(Approval.createdAt));
}
