import Anthropic from '@anthropic-ai/sdk';

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
 * Call Claude API with retry logic
 * Uses exponential backoff with max 3 retries
 */
export async function callClaude(options: CallClaudeOptions): Promise<CallClaudeResult> {
  const client = new Anthropic(); // Uses ANTHROPIC_API_KEY env var
  const model = options.model ?? MODELS.HAIKU;
  const maxRetries = 3;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await client.messages.create({
        model,
        max_tokens: options.maxTokens ?? 4096,
        temperature: options.temperature ?? 0,
        system: options.systemPrompt ?? '',
        messages: [{ role: 'user', content: options.prompt }],
      });

      const textBlock = response.content.find(b => b.type === 'text');
      return {
        content: textBlock?.text ?? '',
        model: response.model,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      };
    } catch (error) {
      if (attempt === maxRetries) throw error;
      const delay = Math.min(1000 * Math.pow(2, attempt), 30000);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw new Error('Unreachable');
}

