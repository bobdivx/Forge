import type { AgentAdapter, AgentSession } from './base';
import { 
  fetchZimaOSSessionsPayload, 
  invokeZimaOSSessionsSend, 
  normalizeZimaOSSessions, 
  mapSessionToAgentRow 
} from '../forge-gateway';

export class ZimaOSAdapter implements AgentAdapter {
  id = 'zimaos';
  name = 'ZimaOS Gateway';

  async listSessions(): Promise<AgentSession[]> {
    const res = await fetchZimaOSSessionsPayload(undefined);
    if (!res.ok) return [];
    
    const rows = normalizeZimaOSSessions(res.data);
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
    return await invokeZimaOSSessionsSend({
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

export const zimaosAdapter = new ZimaOSAdapter();
