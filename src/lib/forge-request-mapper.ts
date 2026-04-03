// @ts-nocheck

export type UiForgeRequest = {
  id: string;
  type: 'Fonctionnalite' | 'Correction';
  title: string;
  status: 'En attente' | 'En cours' | 'Traite' | 'Rejetée';
  agent: string;
  updatedAt: string;
  detail?: string;
};

export function mapDbRequestToUi(r: {
  id: number;
  title: string;
  content: string;
  status: string;
  author?: string | null;
  requestType?: string | null;
  updatedAt: Date;
}): UiForgeRequest {
  const st = String(r.status || '')
    .toLowerCase()
    .replace(/-/g, '_');
  let status: UiForgeRequest['status'] = 'En attente';
  if (st === 'in_progress') status = 'En cours';
  else if (st === 'completed') status = 'Traite';
  else if (st === 'rejected') status = 'Rejetée';

  const type: 'Fonctionnalite' | 'Correction' =
    r.requestType === 'Correction' ? 'Correction' : 'Fonctionnalite';

  const updated =
    r.updatedAt instanceof Date ? r.updatedAt : new Date(r.updatedAt as unknown as string);

  return {
    id: String(r.id),
    type,
    title: r.title,
    status,
    agent: r.author || '—',
    updatedAt: updated.toISOString(),
    detail: r.content ? String(r.content) : undefined,
  };
}
