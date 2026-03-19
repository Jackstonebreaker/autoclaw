import Anthropic from '@anthropic-ai/sdk';
import { SimpleQueue } from './queue.js';

// Lazy-initialize to avoid module-load failure when ANTHROPIC_API_KEY is not set
let _aiClient: Anthropic | null = null;

function getAiClient(): Anthropic {
  if (!_aiClient) {
    _aiClient = new Anthropic();
  }
  return _aiClient;
}

/**
 * Singleton Anthropic client — lazily initialized on first access.
 * Always use this, never instantiate Anthropic directly.
 */
export const aiClient = new Proxy({} as Anthropic, {
  get(_target, prop: string | symbol) {
    return Reflect.get(getAiClient() as object, prop, getAiClient());
  },
});

/** Singleton queue for rate limiting — always use this for API calls */
export const aiQueue = new SimpleQueue();

/** Available Claude models for AutoClaw */
export const MODELS = {
  /** Fast model for analysis tasks */
  HAIKU: 'claude-haiku-4-5-20250315' as const,
  /** Smart model for suggestion generation */
  SONNET: 'claude-sonnet-4-6-20250514' as const,
} as const;

export type ModelId = typeof MODELS[keyof typeof MODELS];

export interface CallClaudeOptions {
  prompt: string;
  model?: ModelId;
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface CallClaudeResult {
  content: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

/**
 * Determine if an error is retriable.
 * 5xx, rate limit (429), and network errors are retriable.
 * 4xx client errors (auth, not found, bad request) are NOT retriable.
 *
 * Uses duck-typing on `.status` to handle SDK APIError instances (which carry
 * an HTTP status code) without relying on `instanceof` checks that break when
 * the SDK is mocked in tests.
 */
export function isRetriableError(error: unknown): boolean {
  // SDK errors expose a numeric `status` field — use it for precise detection.
  // Duck-typing avoids instanceof issues when SDK classes are mocked in tests.
  if (error !== null && typeof error === 'object' && 'status' in error) {
    const status = (error as { status: number }).status;
    if (status === 429 || status >= 500) return true;
    if (status >= 400 && status < 500) return false;
  }

  // Fallback string matching for plain Error objects (e.g. generic network errors
  // or errors thrown in test environments where the SDK is mocked).
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    // Rate limit and server errors are retriable
    if (message.includes('rate') || message.includes('429')) return true;
    if (
      message.includes('500') ||
      message.includes('502') ||
      message.includes('503') ||
      message.includes('504')
    ) return true;
    if (
      message.includes('timeout') ||
      message.includes('econnreset') ||
      message.includes('network')
    ) return true;
    // 4xx client errors are NOT retriable
    if (
      message.includes('401') ||
      message.includes('403') ||
      message.includes('404') ||
      message.includes('400')
    ) return false;
  }
  return true; // Unknown errors: retry by default
}

/**
 * Call Claude API with retry logic.
 * Uses the singleton aiClient and discriminant retry (5xx / rate-limit only).
 * Uses exponential backoff with max 3 retries.
 */
export async function callClaude(options: CallClaudeOptions): Promise<CallClaudeResult> {
  const model = options.model ?? MODELS.HAIKU;
  const maxRetries = 3;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await aiQueue.add(() => aiClient.messages.create({
        model,
        max_tokens: options.maxTokens ?? 4096,
        temperature: options.temperature ?? 0,
        system: options.systemPrompt ?? '',
        messages: [{ role: 'user', content: options.prompt }],
      }));

      const textBlock = response.content.find(b => b.type === 'text');
      return {
        content: textBlock?.text ?? '',
        model: response.model,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      };
    } catch (error) {
      if (attempt === maxRetries || !isRetriableError(error)) throw error;
      const delay = Math.min(1000 * Math.pow(2, attempt), 30000);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw new Error('Unreachable');
}

