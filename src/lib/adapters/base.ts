export interface AgentSession {
  id: string;
  name: string;
  status: 'active' | 'idle' | 'offline';
  model?: string;
  metadata?: Record<string, any>;
}

export interface AgentAdapter {
  id: string;
  name: string;
  
  /** List all active sessions/agents on this provider. */
  listSessions(): Promise<AgentSession[]>;
  
  /** Send a message to a session. */
  sendMessage(params: {
    sessionId: string;
    message: string;
    async?: boolean;
    timeout?: number;
  }): Promise<{ ok: boolean; error?: string; detail?: any }>;
  
  /** Get details of a specific session (including history if supported). */
  getSession(id: string): Promise<AgentSession | null>;
}
