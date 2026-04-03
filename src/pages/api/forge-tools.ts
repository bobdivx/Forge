import type { APIRoute } from 'astro';
import { toolRegistry } from '../../lib/forge-tools';

/** GET  — liste les outils disponibles. */
export const GET: APIRoute = async () => {
  const tools = toolRegistry.list();
  return json({ tools });
};

/** POST — exécute un outil.
 *  Body: { tool: string, input?: Record<string, unknown> }
 */
export const POST: APIRoute = async ({ request, locals }) => {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: 'Corps JSON invalide' }, 400);
  }

  const { tool, input = {} } = body ?? {};
  if (!tool) return json({ ok: false, error: 'Champ "tool" manquant' }, 400);

  const ctx = { email: locals.user?.email as string | undefined };
  const result = await toolRegistry.run(String(tool), input, ctx);

  return json(result);
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
