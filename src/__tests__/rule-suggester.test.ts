import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../ai/index.js', () => ({
  callClaude: vi.fn(),
  MODELS: { HAIKU: 'claude-haiku-4-5-20250315', SONNET: 'claude-sonnet-4-6-20250514' },
  SimpleQueue: class MockSimpleQueue {
    add<T>(fn: () => Promise<T>): Promise<T> { return fn(); }
  },
}));

import { callClaude } from '../ai/index.js';
import { generateRuleSuggestions } from '../rule-suggester.js';
import type { StorageAdapter } from '../storage/adapter.js';
import type { SessionPattern } from '../types.js';

const mockCallClaude = vi.mocked(callClaude);

function createMockStorage(): StorageAdapter {
  return {
    initialize: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    savePattern: vi.fn().mockResolvedValue(undefined),
    getPatterns: vi.fn().mockResolvedValue([]),
    getPatternById: vi.fn().mockResolvedValue(null),
    updatePattern: vi.fn().mockResolvedValue(undefined),
    saveRule: vi.fn().mockResolvedValue(undefined),
    getRules: vi.fn().mockResolvedValue([]),
    getRuleById: vi.fn().mockResolvedValue(null),
    updateRule: vi.fn().mockResolvedValue(undefined),
    saveRuleVersion: vi.fn().mockResolvedValue(undefined),
    getRuleVersions: vi.fn().mockResolvedValue([]),
    saveSession: vi.fn().mockResolvedValue(undefined),
    getSessions: vi.fn().mockResolvedValue([]),
    getSessionById: vi.fn().mockResolvedValue(null),
    saveAlert: vi.fn().mockResolvedValue(undefined),
    getAlerts: vi.fn().mockResolvedValue([]),
    acknowledgeAlert: vi.fn().mockResolvedValue(undefined),
    saveConsolidatedRule: vi.fn().mockResolvedValue(undefined),
    getConsolidatedRules: vi.fn().mockResolvedValue([]),
    saveSnapshot: vi.fn().mockResolvedValue(undefined),
    getLatestSnapshot: vi.fn().mockResolvedValue(null),
  } as unknown as StorageAdapter;
}

const now = new Date().toISOString();

function makePattern(confidence: number): SessionPattern {
  return {
    description: 'Missing error handling',
    category: 'ERROR_HANDLING',
    frequency: 2,
    confidence,
    examples: ['ex1'],
    firstSeen: now,
    lastSeen: now,
  };
}

const mockRuleResponse = JSON.stringify([{
  title: 'Always handle async errors',
  content: 'Use try/catch in async functions',
  category: 'ERROR_HANDLING',
  severity: 'MAJOR',
  confidence: 0.85,
}]);

describe('generateRuleSuggestions', () => {
  let storage: StorageAdapter;

  beforeEach(() => {
    storage = createMockStorage();
    vi.clearAllMocks();
  });

  it('returns [] when no patterns above threshold', async () => {
    const result = await generateRuleSuggestions(storage, {
      patterns: [makePattern(0.5)],
      confidenceThreshold: 0.70,
    });
    expect(result).toEqual([]);
    expect(mockCallClaude).not.toHaveBeenCalled();
  });

  it('filters patterns by confidence threshold', async () => {
    mockCallClaude.mockResolvedValue({ content: mockRuleResponse, model: 'sonnet', inputTokens: 10, outputTokens: 20 });
    await generateRuleSuggestions(storage, {
      patterns: [makePattern(0.5), makePattern(0.8), makePattern(0.9)],
      confidenceThreshold: 0.70,
    });
    const prompt = mockCallClaude.mock.calls[0]?.[0]?.prompt ?? '';
    expect(prompt).not.toContain('"confidence": 0.5');
  });

  it('parses Claude response and returns RuleSuggestion objects', async () => {
    mockCallClaude.mockResolvedValue({ content: mockRuleResponse, model: 'sonnet', inputTokens: 10, outputTokens: 20 });
    const result = await generateRuleSuggestions(storage, {
      patterns: [makePattern(0.85)],
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.title).toBe('Always handle async errors');
    expect(result[0]?.status).toBe('PENDING');
    expect(result[0]?.id).toBeTruthy();
  });

  it('returns [] when Claude returns invalid JSON', async () => {
    mockCallClaude.mockResolvedValue({ content: 'not json', model: 'sonnet', inputTokens: 5, outputTokens: 5 });
    const result = await generateRuleSuggestions(storage, {
      patterns: [makePattern(0.85)],
    });
    expect(result).toEqual([]);
  });

  it('saves suggestions to storage when dryRun=false', async () => {
    mockCallClaude.mockResolvedValue({ content: mockRuleResponse, model: 'sonnet', inputTokens: 10, outputTokens: 20 });
    await generateRuleSuggestions(storage, { patterns: [makePattern(0.85)], dryRun: false });
    expect(storage.saveRule).toHaveBeenCalledTimes(1);
  });

  it('does not save to storage when dryRun=true', async () => {
    mockCallClaude.mockResolvedValue({ content: mockRuleResponse, model: 'sonnet', inputTokens: 10, outputTokens: 20 });
    await generateRuleSuggestions(storage, { patterns: [makePattern(0.85)], dryRun: true });
    expect(storage.saveRule).not.toHaveBeenCalled();
  });

  it('returns [] when Claude response is not an array', async () => {
    mockCallClaude.mockResolvedValue({ content: JSON.stringify({ title: 'foo' }), model: 'sonnet', inputTokens: 5, outputTokens: 5 });
    const result = await generateRuleSuggestions(storage, { patterns: [makePattern(0.85)] });
    expect(result).toEqual([]);
  });

  it('uses default threshold of 0.70 when not specified', async () => {
    mockCallClaude.mockResolvedValue({ content: '[]', model: 'sonnet', inputTokens: 5, outputTokens: 5 });
    await generateRuleSuggestions(storage, {
      patterns: [makePattern(0.69), makePattern(0.71)],
    });
    expect(mockCallClaude).toHaveBeenCalledTimes(1);
  });
});

