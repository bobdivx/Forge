

export interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: any[];
  tool_call_id?: string;
}

const CHARS_PER_TOKEN = 4;

export class ContextCompressor {
  private contextLength: number;
  private thresholdTokens: number;
  private tailTokenBudget: number;

  constructor(contextLength: number, thresholdPercent: number = 0.50, summaryTargetRatio: number = 0.20) {
    this.contextLength = contextLength;
    this.thresholdTokens = Math.max(Math.floor(this.contextLength * thresholdPercent), 4000);
    this.tailTokenBudget = Math.floor(this.thresholdTokens * summaryTargetRatio);
  }

  private estimateTokens(text: string): number {
    return Math.ceil(text.length / CHARS_PER_TOKEN);
  }

  public shouldCompress(currentTokens: number): boolean {
    return currentTokens >= this.thresholdTokens;
  }

  public pruneOldToolResults(messages: Message[], protectTailTokens: number, protectTailCount: number = 5): { prunedMessages: Message[], prunedCount: number } {
    if (!messages || messages.length === 0) return { prunedMessages: [], prunedCount: 0 };
    
    let result = [...messages];
    let pruned = 0;
    
    let accumulated = 0;
    let boundary = result.length;
    const minProtect = Math.min(protectTailCount, result.length);
    
    for (let i = result.length - 1; i >= 0; i--) {
      const msg = result[i];
      const msgTokens = this.estimateTokens(msg.content || '') + 10;
      if (accumulated + msgTokens > protectTailTokens && (result.length - i) >= minProtect) {
        boundary = i;
        break;
      }
      accumulated += msgTokens;
      boundary = i;
    }

    const budgetProtectCount = result.length - boundary;
    const protectedCount = Math.max(budgetProtectCount, minProtect);
    const pruneBoundary = result.length - protectedCount;

    for (let i = 0; i < pruneBoundary; i++) {
      const msg = result[i];
      if (msg.role === 'tool' && msg.content && msg.content.length > 200) {
        result[i] = { ...msg, content: '[Old tool output cleared to save context space]' };
        pruned++;
      }
    }

    return { prunedMessages: result, prunedCount: pruned };
  }

  public compressContext(messages: Message[]): Message[] {
    const currentTokens = this.estimateTokens(messages.map(m => m.content).join(' '));
    if (!this.shouldCompress(currentTokens)) {
      return messages;
    }
    const { prunedMessages } = this.pruneOldToolResults(messages, this.tailTokenBudget, 5);
    return prunedMessages;
  }
}
