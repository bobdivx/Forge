import { AgentAdapter, AgentSession } from './base';
import { 
  fetchOpenClawSessionsPayload, 
  invokeOpenClawSessionsSend, 
  normalizeOpenClawSessions, 
  mapSessionToAgentRow 
} from '../openclaw-gateway';

export class OpenClawAdapter implements AgentAdapter {
  id = 'openclaw';
  name = 'OpenClaw Gateway';

  async listSessions(): Promise<AgentSession[]> {
    const res = await fetchOpenClawSessionsPayload(undefined);
    if (!res.ok) return [];
    
    const rows = normalizeOpenClawSessions(res.data);
    return rows.map((s: any) => {
      const mapped = mapSessionToAgentRow(s);
      return {
        id: mapped.id,
        name: mapped.name,
        status: mapped.status === 'actif' ? 'active' : 'idle',
        model: mapped.model,
        metadata: {
          contextTokens: mapped.contextTokens,
          totalTokens: mapped.totalTokens,
          estimatedCostUsd: mapped.estimatedCostUsd,
          lastSeen: mapped.lastSeen,
        }
      };
    });
  }

  async sendMessage(params: {
    sessionId: string;
    message: string;
    async?: boolean;
    timeout?: number;
  }): Promise<{ ok: boolean; error?: string; detail?: any }> {
    return await invokeOpenClawSessionsSend({
      sessionKey: params.sessionId,
      message: params.message,
      asyncDelivery: params.async,
      timeoutSeconds: params.timeout,
    });
  }

  async getSession(id: string): Promise<AgentSession | null> {
    const sessions = await this.listSessions();
    return sessions.find(s => s.id === id) || null;
  }
}

export const openClawAdapter = new OpenClawAdapter();
