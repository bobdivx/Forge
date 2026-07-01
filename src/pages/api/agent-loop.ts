import type { APIRoute } from 'astro';
import { invokeOpenClawSessionsSend } from '../../lib/openclaw-gateway';
import { loadAstroDb } from '../../lib/load-astro-db';

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Route pour démarrer une boucle autonome d'ingénierie (Loop Engineering)
 * POST /api/agent-loop
 * Body: { taskId: number, sessionKey: string, maxIterations?: number }
 */
export const POST: APIRoute = async ({ request, locals }) => {
  const { db, AgentTask, AgentMessage, eq } = await loadAstroDb();

  if (!locals.user?.email) {
    return json({ error: 'Non authentifié' }, 401);
  }

  let body: { taskId?: unknown; sessionKey?: string; maxIterations?: number };
  try {
    body = (await request.json()) as { taskId?: unknown; sessionKey?: string; maxIterations?: number };
  } catch {
    return json({ error: 'JSON invalide' }, 400);
  }

  const taskId = Number(body.taskId);
  const sessionKey = String(body.sessionKey || '').trim();

  // Hard cap the maximum iterations to prevent runaway LLM loops
  const requestedIterations = Number(body.maxIterations) > 0 ? Number(body.maxIterations) : 5;
  const maxIterations = Math.min(requestedIterations, 20);

  if (!Number.isFinite(taskId) || taskId < 1) {
    return json({ error: 'taskId numérique requis' }, 400);
  }
  if (!sessionKey) {
    return json({ error: 'sessionKey requis' }, 400);
  }

  const email = locals.user.email as string;

  try {
    const tasks = await db.select().from(AgentTask).where(eq(AgentTask.id, taskId));
    if (tasks.length === 0) {
      return json({ error: `Tâche #${taskId} introuvable` }, 404);
    }
    const task = tasks[0];

    // Marquer la tâche comme en cours de traitement par la boucle
    await db
      .update(AgentTask)
      .set({ status: 'in_progress', updatedAt: new Date() })
      .where(eq(AgentTask.id, taskId));

    // Lancer la boucle en arrière-plan sans bloquer la requête HTTP
    runAgentLoopBackground(taskId, task.agentId, sessionKey, maxIterations, task.task, task.input).catch((e) => {
      console.error(`[Loop Engineering] Background loop error for task #${taskId}:`, e);
    });

    return json({
      ok: true,
      message: `Boucle d'ingénierie démarrée pour la tâche #${taskId} (max ${maxIterations} itérations).`,
      taskId,
    });
  } catch (e: any) {
    return json({ error: `Erreur DB: ${e.message}` }, 500);
  }
};

/**
 * Fonction asynchrone qui gère la boucle "Planifier -> Agir -> Vérifier"
 */
async function runAgentLoopBackground(
  taskId: number,
  agentId: string,
  sessionKey: string,
  maxIterations: number,
  taskTitle: string,
  taskInput: string | null
) {
  const { db, AgentTask, AgentMessage, eq } = await loadAstroDb();
  let iteration = 1;
  let completed = false;

  const logLoopMessage = async (targetAgentId: string, content: string) => {
    try {
      await db.insert(AgentMessage).values({
        fromAgent: 'FORGE_LOOP_ENGINE',
        toAgent: targetAgentId,
        content,
        timestamp: new Date(),
      });
    } catch (e) {
      console.error('[Loop Engineering] Error logging message:', e);
    }
  };

  await logLoopMessage(agentId, `🔄 [Loop] Début de la boucle autonome pour la tâche #${taskId}. Objectif: ${taskTitle}`);

  while (iteration <= maxIterations && !completed) {
    const prompt = `[Loop Engineering - Itération ${iteration}/${maxIterations}]
Tâche : ${taskTitle}
Détails : ${taskInput || 'Aucun'}

Veuillez analyser la situation actuelle, planifier l'action nécessaire pour avancer sur cette tâche, exécuter cette action en utilisant vos outils (ex: lire un fichier, modifier du code, lancer un test), puis vérifier le résultat.

Si la tâche est entièrement résolue et vérifiée avec succès, terminez votre réponse par le mot-clé exact : LOOP_COMPLETED
Si des actions supplémentaires sont nécessaires pour la prochaine itération, terminez votre réponse par le mot-clé exact : LOOP_CONTINUE`;

    try {
      await logLoopMessage(agentId, `⏳ [Loop Itération ${iteration}] Envoi des instructions à l'agent...`);

      // On envoie la directive en mode wait (asyncDelivery = false)
      // Si la durée dépasse timeoutSeconds (par défaut 120s), cela peut échouer, d'où un timeout plus long
      const result = await invokeOpenClawSessionsSend({
        sessionKey,
        message: prompt,
        timeoutSeconds: 300,
        asyncDelivery: false,
      });

      if (!result.ok) {
        await logLoopMessage(agentId, `❌ [Loop Itération ${iteration}] Échec de la communication avec l'agent : ${result.error}`);
        break;
      }

      // Extraire la réponse de l'agent. Le retour exact dépend de la structure de l'outil OpenClaw,
      // on suppose que la réponse textuelle est disponible dans result.detail.message ou qu'on peut lire le résultat du json.
      const agentResponse = JSON.stringify(result.detail);

      if (agentResponse.includes('LOOP_COMPLETED')) {
        completed = true;
        await logLoopMessage(agentId, `✅ [Loop Itération ${iteration}] L'agent a déclaré la tâche comme terminée.`);
      } else if (agentResponse.includes('LOOP_CONTINUE')) {
        await logLoopMessage(agentId, `🔄 [Loop Itération ${iteration}] L'agent demande à continuer la boucle.`);
      } else {
        await logLoopMessage(agentId, `⚠️ [Loop Itération ${iteration}] L'agent n'a renvoyé ni LOOP_COMPLETED ni LOOP_CONTINUE. Continuation par défaut.`);
      }

    } catch (e: any) {
      await logLoopMessage(agentId, `❌ [Loop Itération ${iteration}] Erreur système inattendue : ${e.message}`);
      break;
    }

    iteration++;
  }

  // Fin de la boucle
  const finalStatus = completed ? 'completed' : 'pending'; // Si pas fini, on remet pending (ou failed si on avait ce statut)

  await db
    .update(AgentTask)
    .set({ status: finalStatus, updatedAt: new Date() })
    .where(eq(AgentTask.id, taskId));

  if (completed) {
    await logLoopMessage(agentId, `🎉 [Loop] Boucle terminée avec succès pour la tâche #${taskId} en ${iteration - 1} itération(s).`);
  } else {
    await logLoopMessage(agentId, `🛑 [Loop] Boucle arrêtée pour la tâche #${taskId} après avoir atteint la limite de ${maxIterations} itération(s) sans complétion.`);
  }
}
