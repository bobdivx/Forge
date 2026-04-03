import type { APIRoute } from 'astro';
import { db, AgentMemory, AgentTask, eq, desc } from 'astro:db';
import { toolRegistry } from '../../lib/forge-tools';
import { parseCommand, resolveCommand, FORGE_COMMANDS } from '../../lib/forge-commands';

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function ok(output: string, type: 'text' | 'list' = 'text') {
  return json({ ok: true, output, type });
}

function err(output: string) {
  return json({ ok: false, output, type: 'error' });
}

/**
 * POST { command: string, agentId: string }
 * Exécute une commande slash dans le REPL Forge.
 */
export const POST: APIRoute = async ({ request, locals }) => {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return err('Corps JSON invalide');
  }

  const { command, agentId = 'forge' } = body ?? {};
  if (!command) return err('Champ "command" manquant');

  const parsed = parseCommand(String(command));
  if (!parsed) {
    return err(
      'Les commandes commencent par /  —  tapez /help pour la liste.',
    );
  }

  const email = locals.user?.email as string | undefined;
  const toolCtx = { agentId, email };
  const resolvedName = resolveCommand(parsed.name)?.name ?? parsed.name;

  // ── /help ──────────────────────────────────────────────────────────────────
  if (resolvedName === 'help') {
    const target = parsed.args[0];
    if (target) {
      const cmd = resolveCommand(target.replace(/^\//, ''));
      if (!cmd)
        return err(`Commande inconnue: ${target}`);
      const exLines =
        cmd.examples?.map((e) => `  ${e}`).join('\n') ?? '';
      return ok(
        `/${cmd.name}  —  ${cmd.description}\n\nUsage: ${cmd.usage}${exLines ? `\n\nExemples:\n${exLines}` : ''}`,
      );
    }
    const lines = FORGE_COMMANDS.map(
      (c) =>
        `  /${c.name.padEnd(8)} ${c.aliases ? `(${c.aliases.join(',')})`.padEnd(8) : '        '} ${c.description}`,
    );
    return ok(
      `Commandes disponibles:\n${lines.join('\n')}\n\nTip: /tools run git_status project=<nom> pour commencer.`,
    );
  }

  // ── /tools ─────────────────────────────────────────────────────────────────
  if (resolvedName === 'tools') {
    const sub = parsed.args[0] ?? 'list';

    if (sub === 'list') {
      const tools = toolRegistry.list();
      const byCategory: Record<string, typeof tools> = {};
      for (const t of tools) {
        (byCategory[t.category] ??= []).push(t);
      }
      const lines: string[] = [];
      for (const [cat, list] of Object.entries(byCategory)) {
        lines.push(`[${cat.toUpperCase()}]`);
        for (const t of list) {
          lines.push(`  ${t.name.padEnd(22)} ${t.description}`);
        }
      }
      return ok(`${tools.length} outils disponibles:\n\n${lines.join('\n')}`, 'list');
    }

    if (sub === 'run' && parsed.args[1]) {
      const toolName = parsed.args[1];
      const params: Record<string, unknown> = {};
      for (const a of parsed.args.slice(2)) {
        const eq = a.indexOf('=');
        if (eq > 0) {
          const k = a.slice(0, eq).replace(/^--/, '');
          const v = a.slice(eq + 1);
          // Coerce simple types
          if (v === 'true') params[k] = true;
          else if (v === 'false') params[k] = false;
          else if (/^\d+$/.test(v)) params[k] = parseInt(v, 10);
          else params[k] = v;
        }
      }

      const result = await toolRegistry.run(toolName, params, toolCtx);
      if (!result.ok)
        return err(result.error ?? `Erreur lors de l'exécution de ${toolName}`);

      const rawOutput = result.output;
      const outputStr =
        typeof rawOutput === 'string'
          ? rawOutput
          : Array.isArray(rawOutput)
            ? (rawOutput as string[]).join('\n')
            : JSON.stringify(rawOutput, null, 2);

      return ok(`[${toolName}] ${result.durationMs}ms\n${'─'.repeat(40)}\n${outputStr}`);
    }

    return err(
      'Usage: /tools list  |  /tools run <outil> [clé=valeur …]\nExemple: /tools run git_status project=my-app',
    );
  }

  // ── /memory ────────────────────────────────────────────────────────────────
  if (resolvedName === 'memory') {
    const sub = parsed.args[0] ?? 'list';

    if (sub === 'list') {
      try {
        const memories = await db
          .select()
          .from(AgentMemory)
          .where(eq(AgentMemory.agentId, agentId))
          .orderBy(desc(AgentMemory.createdAt))
          .limit(30);
        if (!memories.length)
          return ok(`Aucune mémoire enregistrée pour "${agentId}".`);
        const lines = memories.map(
          (m) =>
            `  [#${String(m.id).padEnd(4)}] ${m.content.slice(0, 90)}${m.content.length > 90 ? '…' : ''}`,
        );
        return ok(
          `Mémoires de "${agentId}" (${memories.length}):\n${lines.join('\n')}`,
          'list',
        );
      } catch (e: any) {
        return err(`Erreur DB: ${e.message}`);
      }
    }

    if (sub === 'add') {
      const content = parsed.args.slice(1).join(' ').trim();
      if (!content)
        return err('Contenu requis — usage: /memory add <texte>');
      try {
        await db
          .insert(AgentMemory)
          .values({ agentId, content, createdAt: new Date() });
        return ok(`Mémoire sauvegardée pour "${agentId}" ✓`);
      } catch (e: any) {
        return err(`Erreur DB: ${e.message}`);
      }
    }

    if (sub === 'delete' && parsed.args[1]) {
      const numId = parseInt(parsed.args[1], 10);
      if (isNaN(numId)) return err('ID invalide');
      try {
        await db.delete(AgentMemory).where(eq(AgentMemory.id, numId));
        return ok(`Mémoire #${numId} supprimée.`);
      } catch (e: any) {
        return err(`Erreur DB: ${e.message}`);
      }
    }

    if (sub === 'clear') {
      try {
        await db
          .delete(AgentMemory)
          .where(eq(AgentMemory.agentId, agentId));
        return ok(`Toutes les mémoires de "${agentId}" ont été effacées.`);
      } catch (e: any) {
        return err(`Erreur DB: ${e.message}`);
      }
    }

    return err(
      'Usage: /memory list | /memory add <texte> | /memory delete <id> | /memory clear',
    );
  }

  // ── /task ──────────────────────────────────────────────────────────────────
  if (resolvedName === 'task') {
    const sub = parsed.args[0] ?? 'list';

    if (sub === 'list') {
      try {
        const tasks = await db
          .select()
          .from(AgentTask)
          .orderBy(desc(AgentTask.createdAt))
          .limit(25);
        if (!tasks.length) return ok('Aucune tâche enregistrée.');
        const lines = tasks.map((t) => {
          const status = String(t.status).toUpperCase().padEnd(9);
          const agent = t.agentId.slice(0, 18).padEnd(18);
          const task = t.task.slice(0, 52);
          return `  [${status}] ${agent} ${task}`;
        });
        return ok(`Tâches récentes (${tasks.length}):\n${lines.join('\n')}`, 'list');
      } catch (e: any) {
        return err(`Erreur DB: ${e.message}`);
      }
    }

    if (sub === 'create' && parsed.args[1]) {
      const taskAgentId = parsed.args[1];
      const task = parsed.args.slice(2).join(' ').trim();
      if (!task)
        return err(
          'Description requise — usage: /task create <agentId> <description>',
        );
      try {
        const now = new Date();
        await db
          .insert(AgentTask)
          .values({ agentId: taskAgentId, task, status: 'pending', createdAt: now, updatedAt: now });
        return ok(`Tâche créée pour "${taskAgentId}":\n  → ${task}`);
      } catch (e: any) {
        return err(`Erreur DB: ${e.message}`);
      }
    }

    return err(
      'Usage: /task list  |  /task create <agentId> <description>',
    );
  }

  // ── Commande inconnue ──────────────────────────────────────────────────────
  const known = FORGE_COMMANDS.map((c) => `/${c.name}`).join('  ');
  return err(
    `Commande inconnue: /${parsed.name}\nCommandes: ${known}\n\nTapez /help pour plus de détails.`,
  );
};
