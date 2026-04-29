import { getZimaOSInfraClient } from './zimaos-infra-client';

export type ForgeToolCall =
  | { tool: 'read_file'; path: string }
  | { tool: 'write_file'; path: string; content: string }
  | { tool: 'exec'; command: string }
  | { tool: 'restart_gateway'; containerName?: string };

export type ForgeToolResult = {
  ok: boolean;
  tool: ForgeToolCall['tool'];
  output?: string;
  error?: string;
};

export async function runForgeTool(call: ForgeToolCall): Promise<ForgeToolResult> {
  const infra = await getZimaOSInfraClient();
  try {
    if (call.tool === 'read_file') {
      return { ok: true, tool: call.tool, output: infra.readFile(call.path) };
    }
    if (call.tool === 'write_file') {
      infra.writeFile(call.path, call.content);
      return { ok: true, tool: call.tool, output: 'ok' };
    }
    if (call.tool === 'exec') {
      return { ok: true, tool: call.tool, output: infra.exec(call.command) };
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

