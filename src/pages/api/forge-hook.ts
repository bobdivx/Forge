/**
 * forge-hook.ts — Webhook public pour agents locaux.
 *
 * Endpoint NON authentifié accessible depuis 127.0.0.1 uniquement.
 * Permet aux agents (via curl/fetch depuis le ZimaCube) de :
 *   - Remonter des bugs / demandes de correction
 *   - Signaler la fin d'une tâche
 *   - Écrire en mémoire persistante
 *   - Envoyer un message inter-agents
 *   - Demander une directive à Bob
 *
 * Format POST :
 * {
 *   agentId:  string          // ex: "TESTEUR_QA"
 *   type:     'bug' | 'task' | 'completion' | 'memory' | 'message' | 'request'
 *   title:    string          // résumé court (obligatoire)
 *   content:  string          // détail complet (obligatoire)
 *   priority?: 'low' | 'medium' | 'high' | 'critical'
 *   taskId?:  number          // pour 'completion' — ID de la tâche terminée
 *   to?:      string          // pour 'message' — agent destinataire
 *   project?: string          // nom du projet concerné
 * }
 */
import type { APIRoute } from 'astro';
import { db, AgentTask, AgentMessage, AgentMemory } from 'astro:db';

const ALLOWED_TYPES = ['bug', 'task', 'completion', 'memory', 'message', 'request'] as const;
type HookType = (typeof ALLOWED_TYPES)[number];

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const POST: APIRoute = async ({ request, clientAddress }) => {
  // Sécurité : uniquement depuis le réseau local / loopback
  const isLocal =
    clientAddress === '127.0.0.1' ||
    clientAddress === '::1' ||
    clientAddress?.startsWith('192.168.') ||
    clientAddress?.startsWith('10.') ||
    clientAddress?.startsWith('172.');

  if (!isLocal) {
    return json({ error: 'forge-hook réservé au réseau local' }, 403);
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Corps JSON invalide' }, 400);
  }

  const { agentId, type, title, content, priority = 'medium', taskId, to, project } = body ?? {};

  if (!agentId || !type || !title || !content) {
    return json(
      { error: 'Champs requis : agentId, type, title, content' },
      400,
    );
  }

  if (!ALLOWED_TYPES.includes(type as HookType)) {
    return json(
      { error: `type invalide. Valeurs: ${ALLOWED_TYPES.join(', ')}` },
      400,
    );
  }

  const now = new Date();
  const projectTag = project ? ` [${project}]` : '';

  try {
    // ── bug / task / request / completion → AgentTask ─────────────────────
    if (type === 'bug' || type === 'task' || type === 'request') {
      const statusMap: Record<string, string> = {
        bug: 'bug',
        task: 'pending',
        request: 'pending',
      };
      await db.insert(AgentTask).values({
        agentId: String(agentId),
        task: `${String(title)}${projectTag}`,
        input: String(content),
        status: statusMap[type as string] ?? 'pending',
        createdAt: now,
        updatedAt: now,
      });

      // Écriture mémoire automatique pour les bugs
      if (type === 'bug') {
        await db.insert(AgentMemory).values({
          agentId: 'CHEF_TECHNIQUE',
          content: `[BUG ${priority.toUpperCase()}] ${agentId}: ${title}${projectTag} — ${content.slice(0, 200)}`,
          tags: JSON.stringify(['bug', priority, agentId]),
          createdAt: now,
        });
      }

      return json({
        ok: true,
        message: `${type} enregistré pour ${agentId}`,
        type,
      });
    }

    // ── completion → mise à jour AgentTask ────────────────────────────────
    if (type === 'completion') {
      if (taskId) {
        // Marquer la tâche existante comme terminée
        await db.insert(AgentMessage).values({
          fromAgent: String(agentId),
          toAgent: 'CHEF_TECHNIQUE',
          content: `✅ TÂCHE TERMINÉE [#${taskId}] — ${title}${projectTag}: ${content.slice(0, 500)}`,
          timestamp: now,
        });
      }
      // Nouvelle entrée tâche complétée
      await db.insert(AgentTask).values({
        agentId: String(agentId),
        task: `✅ ${String(title)}${projectTag}`,
        input: String(content),
        status: 'completed',
        createdAt: now,
        updatedAt: now,
      });
      return json({ ok: true, message: `Completion enregistrée pour ${agentId}`, type });
    }

    // ── memory → AgentMemory ──────────────────────────────────────────────
    if (type === 'memory') {
      await db.insert(AgentMemory).values({
        agentId: String(agentId),
        content: `${String(title)} — ${String(content)}`,
        tags: project ? JSON.stringify([project]) : null,
        createdAt: now,
      });
      return json({ ok: true, message: `Mémoire enregistrée pour ${agentId}`, type });
    }

    // ── message → AgentMessage ────────────────────────────────────────────
    if (type === 'message') {
      await db.insert(AgentMessage).values({
        fromAgent: String(agentId),
        toAgent: to ? String(to) : 'CHEF_TECHNIQUE',
        content: `[${String(title)}${projectTag}] ${String(content)}`,
        timestamp: now,
      });
      return json({ ok: true, message: `Message envoyé de ${agentId} vers ${to ?? 'CHEF_TECHNIQUE'}`, type });
    }

    return json({ error: 'Type non traité' }, 400);
  } catch (e: any) {
    return json({ error: `Erreur DB: ${e.message}` }, 500);
  }
};

/** GET — santé du hook, utilisé par les agents pour tester la connexion. */
export const GET: APIRoute = async ({ clientAddress }) => {
  return json({
    ok: true,
    service: 'forge-hook',
    version: '1.0',
    clientAddress,
    message: 'Forge Hook actif. POST pour reporter bugs, tâches, mémoires.',
    types: ALLOWED_TYPES,
  });
};
