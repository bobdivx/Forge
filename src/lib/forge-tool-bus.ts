import { getZimaOSInfraClient } from './zimaos-infra-client';
import { loadAstroDb } from './load-astro-db';

export type ForgeToolCall =
  | { tool: 'read_file'; path: string }
  | { tool: 'write_file'; path: string; content: string }
  | { tool: 'exec'; command: string }
  | { tool: 'update_request_status'; requestId: number; status: 'pending' | 'in_progress' | 'completed' | 'rejected' }
  | { tool: 'restart_gateway'; containerName?: string };

export type ForgeToolResult = {
  ok: boolean;
  tool: ForgeToolCall['tool'];
  output?: string;
  error?: string;
  beforeContent?: string | null;
  afterContent?: string | null;
  diff?: string;
  addedLines?: number;
  deletedLines?: number;
  durationMs?: number;
  exitCode?: number;
};

function buildUnifiedDiff(path: string, beforeContent: string | null, afterContent: string | null): string {
  const before = beforeContent ?? '';
  const after = afterContent ?? '';
  if (before === after) return '';

  const beforeLines = before.split(/\r?\n/);
  const afterLines = after.split(/\r?\n/);
  const rows = [`--- ${path}`, `+++ ${path}`];
  const max = Math.max(beforeLines.length, afterLines.length);

  for (let i = 0; i < max; i++) {
    const oldLine = beforeLines[i];
    const newLine = afterLines[i];
    if (oldLine === newLine) {
      if (oldLine !== undefined) rows.push(` ${oldLine}`);
      continue;
    }
    if (oldLine !== undefined) rows.push(`-${oldLine}`);
    if (newLine !== undefined) rows.push(`+${newLine}`);
  }

  return rows.join('\n');
}

function countDiffStats(diff: string): { addedLines: number; deletedLines: number } {
  let addedLines = 0;
  let deletedLines = 0;
  for (const line of diff.split('\n')) {
    if (line.startsWith('+++') || line.startsWith('---')) continue;
    if (line.startsWith('+')) addedLines++;
    if (line.startsWith('-')) deletedLines++;
  }
  return { addedLines, deletedLines };
}

export async function runForgeTool(call: ForgeToolCall): Promise<ForgeToolResult> {
  const infra = await getZimaOSInfraClient();
  try {
    if (call.tool === 'read_file') {
      return { ok: true, tool: call.tool, output: infra.readFile(call.path) };
    }
    if (call.tool === 'write_file') {
      const beforeContent = infra.exists(call.path) ? infra.readFile(call.path) : null;
      infra.writeFile(call.path, call.content);
      const afterContent = infra.readFile(call.path);
      const diff = buildUnifiedDiff(call.path, beforeContent, afterContent);
      const stats = countDiffStats(diff);
      return {
        ok: true,
        tool: call.tool,
        output: 'ok',
        beforeContent,
        afterContent,
        diff,
        ...stats,
      };
    }
    if (call.tool === 'exec') {
      const startedAt = Date.now();
      return { ok: true, tool: call.tool, output: infra.exec(call.command), durationMs: Date.now() - startedAt, exitCode: 0 };
    }
    if (call.tool === 'update_request_status') {
      const { db, Request, eq } = await loadAstroDb();
      await db.update(Request).set({ status: call.status, updatedAt: new Date() }).where(eq(Request.id, call.requestId));
      return { ok: true, tool: call.tool, output: `Statut de la demande #${call.requestId} mis à jour : ${call.status}` };
    }
    const out = call.containerName ? infra.exec(`docker restart ${call.containerName}`) : infra.restartContainer();
    return { ok: true, tool: call.tool, output: out };
  } catch (e: unknown) {
    return {
      ok: false,
      tool: call.tool,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

