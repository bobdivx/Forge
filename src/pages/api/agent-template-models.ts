import type { APIRoute } from 'astro';
import {
  FORGE_AGENT_INSTRUCTION_ROWS,
  readInstructionMdFromRepo,
} from '../../lib/agent-instruction-defaults';

export const GET: APIRoute = async () => {
  const templates = FORGE_AGENT_INSTRUCTION_ROWS.map((r) => ({
    id: r.agentId,
    label: r.agentId.replace(/_/g, ' '),
    defaultModel: r.model,
    filePath: r.filePath,
    defaultPrompt: readInstructionMdFromRepo(r.filePath),
  }));
  return new Response(JSON.stringify({ templates }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

