/**
 * Routage des demandes carnet de bord (table Request) vers les agents ZimaOS.
 */

export function resolveAssigneeForForgeRequest(r: {
  assigneeAgentId?: string | null;
  requestType?: string | null;
}): string {
  const direct = String(r.assigneeAgentId ?? '').trim();
  if (direct) return direct;
  const rt = String(r.requestType ?? '').trim();
  const lower = rt.toLowerCase();
  if (lower === 'correction') return 'DEV_FRONTEND';
  if (
    lower === 'fonctionnalite' ||
    lower === 'fonctionnalité' ||
    lower === 'feature_proposal'
  ) {
    return 'VEILLE_TECH';
  }
  return 'CHEF_TECHNIQUE';
}

/** Marqueur stable dans AgentTask.task pour lier une tâche à une demande. */
export function forgeRequestTaskTitle(id: number, title: string): string {
  return `[ForgeRequest #${id}] ${title}`;
}

export function extractForgeRequestIdFromTaskBlob(blob: string): number | null {
  const m = blob.match(/ForgeRequest\s*#(\d+)/i);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Ligne « machine » à la fin de la réponse agent ; Forge la détecte dans ZimaOS (scan automatique).
 */
export function buildForgeTaskDispatchFooter(taskId: number): string {
  return [
    '',
    '---',
    'Clôture obligatoire : termine ta réponse par une seule ligne exactement de cette forme :',
    `FORGE_DONE task=${taskId} status=completed`,
    'Si tu ne peux pas terminer :',
    `FORGE_DONE task=${taskId} status=failed`,
    'Forge synchronise le carnet automatiquement ; pas besoin d’appeler une API HTTP à la main.',
  ].join('\n');
}

export function appendForgeDoneFooterToTaskBody(taskId: number, base: string): string {
  const merged = `${base.trimEnd()}\n${buildForgeTaskDispatchFooter(taskId)}`;
  return merged.slice(0, 120_000);
}

/** Retire une zone FORGE_DONE déjà présente en fin de corps (ré-envoi sans doublon). */
export function stripForgeDoneFooterFromBody(text: string): string {
  const s = String(text || '');
  const match = /\nFORGE_DONE\s+task\s*=/i.exec(s);
  if (!match || match.index == null) return s.trimEnd();
  return s.slice(0, match.index).trimEnd();
}
