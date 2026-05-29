export interface MemoryProvider {
  name: string;
  
  initialize?(sessionId: string, context?: Record<string, any>): Promise<void>;
  shutdown?(): Promise<void>;
  
  getSystemPromptBlock?(): Promise<string | null>;
  prefetch?(query: string, sessionId: string): Promise<string | null>;
  syncTurn?(userContent: string, assistantContent: string, sessionId: string, messages?: any[]): Promise<void>;
  
  getToolSchemas?(): any[];
  handleToolCall?(toolName: string, args: Record<string, any>): Promise<string>;
}

export class MemoryManager {
  private providers: MemoryProvider[] = [];
  private toolToProvider: Map<string, MemoryProvider> = new Map();

  public addProvider(provider: MemoryProvider): void {
    const isBuiltin = provider.name === 'builtin';
    const hasExternal = this.providers.some(p => p.name !== 'builtin');

    if (!isBuiltin && hasExternal) {
      console.warn(`Rejected memory provider '${provider.name}' - external provider is already registered.`);
      return;
    }

    this.providers.push(provider);

    if (provider.getToolSchemas) {
      for (const schema of provider.getToolSchemas()) {
        const toolName = schema.name;
        if (toolName && !this.toolToProvider.has(toolName)) {
          this.toolToProvider.set(toolName, provider);
        }
      }
    }
  }

  public async buildSystemPrompt(): Promise<string> {
    const blocks: string[] = [];
    for (const provider of this.providers) {
      if (provider.getSystemPromptBlock) {
        try {
          const block = await provider.getSystemPromptBlock();
          if (block && block.trim()) blocks.push(block);
        } catch (e) {
          console.warn(`Memory provider '${provider.name}' getSystemPromptBlock failed:`, e);
        }
      }
    }
    return blocks.join('\n\n');
  }

  public async prefetchAll(query: string, sessionId: string): Promise<string> {
    const parts: string[] = [];
    for (const provider of this.providers) {
      if (provider.prefetch) {
        try {
          const result = await provider.prefetch(query, sessionId);
          if (result && result.trim()) parts.push(result);
        } catch (e) {
          console.debug(`Memory provider '${provider.name}' prefetch failed:`, e);
        }
      }
    }
    return parts.join('\n\n');
  }

  public async syncAll(userContent: string, assistantContent: string, sessionId: string, messages?: any[]): Promise<void> {
    for (const provider of this.providers) {
      if (provider.syncTurn) {
        try {
          await provider.syncTurn(userContent, assistantContent, sessionId, messages);
        } catch (e) {
          console.warn(`Memory provider '${provider.name}' syncTurn failed:`, e);
        }
      }
    }
  }
}
