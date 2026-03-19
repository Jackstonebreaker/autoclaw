import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Must be hoisted so mocks are in place before module-level singletons are created
const { mockCreate } = vi.hoisted(() => {
  const mockCreate = vi.fn();
  return { mockCreate };
});

vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    messages = { create: mockCreate };
  },
}));

// Import AFTER mocks are set up
import { callClaude, isRetriableError, aiClient, aiQueue, MODELS } from '../ai/client.js';

describe('isRetriableError()', () => {
  it('returns true for rate limit (429) errors', () => {
    expect(isRetriableError(new Error('rate limit 429'))).toBe(true);
    expect(isRetriableError(new Error('rate exceeded'))).toBe(true);
  });

  it('returns true for 5xx server errors', () => {
    expect(isRetriableError(new Error('500 internal server error'))).toBe(true);
    expect(isRetriableError(new Error('502 bad gateway'))).toBe(true);
    expect(isRetriableError(new Error('503 service unavailable'))).toBe(true);
    expect(isRetriableError(new Error('504 gateway timeout'))).toBe(true);
  });

  it('returns true for network errors', () => {
    expect(isRetriableError(new Error('timeout exceeded'))).toBe(true);
    expect(isRetriableError(new Error('econnreset by peer'))).toBe(true);
    expect(isRetriableError(new Error('network failure'))).toBe(true);
  });

  it('returns false for 4xx client errors', () => {
    expect(isRetriableError(new Error('401 unauthorized'))).toBe(false);
    expect(isRetriableError(new Error('403 forbidden'))).toBe(false);
    expect(isRetriableError(new Error('404 not found'))).toBe(false);
    expect(isRetriableError(new Error('400 bad request'))).toBe(false);
  });

  it('returns true for unknown error types (retry by default)', () => {
    expect(isRetriableError(new Error('some unknown problem'))).toBe(true);
    expect(isRetriableError('a string error')).toBe(true);
    expect(isRetriableError(null)).toBe(true);
  });
});

describe('MODELS', () => {
  it('exports HAIKU and SONNET model ids', () => {
    expect(MODELS.HAIKU).toContain('haiku');
    expect(MODELS.SONNET).toContain('sonnet');
  });
});

describe('aiClient and aiQueue singletons', () => {
  it('aiClient is a singleton object with messages.create', () => {
    expect(aiClient).toBeDefined();
    expect(typeof aiClient.messages.create).toBe('function');
  });

  it('aiQueue is a SimpleQueue instance with add method', () => {
    expect(aiQueue).toBeDefined();
    expect(typeof aiQueue.add).toBe('function');
  });
});

describe('callClaude()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const mockResponse = {
    model: 'claude-haiku-4-5-20250315',
    content: [{ type: 'text', text: 'Hello!' }],
    usage: { input_tokens: 10, output_tokens: 5 },
  };

  it('calls aiClient.messages.create and returns parsed result', async () => {
    mockCreate.mockResolvedValueOnce(mockResponse);

    const result = await callClaude({ prompt: 'Say hello' });

    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
      model: MODELS.HAIKU,
      messages: [{ role: 'user', content: 'Say hello' }],
    }));
    expect(result.content).toBe('Hello!');
    expect(result.model).toBe('claude-haiku-4-5-20250315');
    expect(result.inputTokens).toBe(10);
    expect(result.outputTokens).toBe(5);
  });

  it('uses custom model when provided', async () => {
    mockCreate.mockResolvedValueOnce({ ...mockResponse, model: MODELS.SONNET });

    await callClaude({ prompt: 'test', model: MODELS.SONNET });

    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
      model: MODELS.SONNET,
    }));
  });

  it('retries on retriable errors and succeeds on second attempt', async () => {
    mockCreate
      .mockRejectedValueOnce(new Error('503 service unavailable'))
      .mockResolvedValueOnce(mockResponse);

    const resultPromise = callClaude({ prompt: 'test' });
    // Advance past the exponential backoff delay (2^1 * 1000 = 2000ms)
    await vi.advanceTimersByTimeAsync(2500);
    const result = await resultPromise;

    expect(mockCreate).toHaveBeenCalledTimes(2);
    expect(result.content).toBe('Hello!');
  });

  it('throws immediately on non-retriable 4xx error (no retry)', async () => {
    mockCreate.mockRejectedValueOnce(new Error('401 unauthorized'));

    await expect(callClaude({ prompt: 'test' })).rejects.toThrow('401 unauthorized');
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it('throws after 3 failed retriable attempts', async () => {
    const err = new Error('503 server error');
    mockCreate.mockRejectedValue(err);

    const resultPromise = callClaude({ prompt: 'test' });
    // Register rejection handler BEFORE advancing timers to avoid unhandled rejection
    const assertion = expect(resultPromise).rejects.toThrow('503 server error');
    // Advance past all retry delays: 2000ms + 4000ms = 6000ms
    await vi.advanceTimersByTimeAsync(10000);
    await assertion;

    expect(mockCreate).toHaveBeenCalledTimes(3);
  });
});

