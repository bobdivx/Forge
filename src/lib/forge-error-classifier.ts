export type FailoverReason =
  | 'auth'
  | 'auth_permanent'
  | 'billing'
  | 'rate_limit'
  | 'overloaded'
  | 'server_error'
  | 'timeout'
  | 'context_overflow'
  | 'payload_too_large'
  | 'image_too_large'
  | 'model_not_found'
  | 'provider_policy_blocked'
  | 'content_policy_blocked'
  | 'format_error'
  | 'invalid_encrypted_content'
  | 'multimodal_tool_content_unsupported'
  | 'thinking_signature'
  | 'long_context_tier'
  | 'oauth_long_context_beta_forbidden'
  | 'llama_cpp_grammar_pattern'
  | 'unknown';

export interface ClassifiedError {
  reason: FailoverReason;
  statusCode?: number;
  provider?: string;
  model?: string;
  message: string;
  retryable: boolean;
  shouldCompress: boolean;
  shouldRotateCredential: boolean;
  shouldFallback: boolean;
}

export function classifyApiError(error: any, options?: { provider?: string; model?: string; approxTokens?: number; contextLength?: number }): ClassifiedError {
  const errMsg = String(error?.message || error || '').toLowerCase();
  const statusCode = error?.status || error?.statusCode || null;

  const result = (reason: FailoverReason, opts: Partial<ClassifiedError>): ClassifiedError => ({
    reason,
    statusCode,
    provider: options?.provider,
    model: options?.model,
    message: errMsg,
    retryable: opts.retryable ?? true,
    shouldCompress: opts.shouldCompress ?? false,
    shouldRotateCredential: opts.shouldRotateCredential ?? false,
    shouldFallback: opts.shouldFallback ?? false,
  });

  if (errMsg.includes('violates our usage policies') || errMsg.includes('content_filter') || errMsg.includes('prompt was flagged')) {
    return result('content_policy_blocked', { retryable: false, shouldFallback: true });
  }

  if (statusCode === 429) {
    if (errMsg.includes('extra usage') && errMsg.includes('long context')) {
      return result('long_context_tier', { retryable: true, shouldCompress: true });
    }
    return result('rate_limit', { retryable: true });
  }

  if (statusCode === 401) {
    return result('auth', { retryable: false, shouldRotateCredential: true, shouldFallback: true });
  }

  if (statusCode === 403) {
    if (errMsg.includes('key limit exceeded') || errMsg.includes('spending limit') || errMsg.includes('insufficient credits')) {
      return result('billing', { retryable: false, shouldRotateCredential: true, shouldFallback: true });
    }
    return result('auth', { retryable: false, shouldFallback: true });
  }

  if (errMsg.includes('context length') || errMsg.includes('maximum context') || errMsg.includes('too many tokens')) {
    return result('context_overflow', { retryable: true, shouldCompress: true });
  }

  if (errMsg.includes('timed out') || errMsg.includes('deadline exceeded')) {
    return result('timeout', { retryable: true });
  }

  if (errMsg.includes('model not found') || errMsg.includes('is not a valid model') || errMsg.includes('does not exist')) {
    return result('model_not_found', { retryable: false, shouldFallback: true });
  }

  if (statusCode && statusCode >= 500) {
    if (statusCode === 503 || statusCode === 529) {
      return result('overloaded', { retryable: true });
    }
    return result('server_error', { retryable: true });
  }

  return result('unknown', { retryable: true });
}
