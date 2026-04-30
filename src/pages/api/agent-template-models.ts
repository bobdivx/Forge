import type { APIRoute } from 'astro';
import {
  FORGE_AGENT_INSTRUCTION_ROWS,
  getInitialSystemPrompt,
} from '../../lib/agent-instruction-defaults';

export const GET: APIRoute = async () => {
  const templates = FORGE_AGENT_INSTRUCTION_ROWS.map((r) => ({
    id: r.agentId,
    label: r.agentId.replace(/_/g, ' '),
    defaultModel: r.model,
    filePath: `db://${r.agentId}`,
    defaultPrompt: getInitialSystemPrompt(r.agentId),
  }));
  return new Response(JSON.stringify({ templates }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

