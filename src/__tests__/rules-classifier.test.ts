import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../ai/index.js', () => ({
  callClaude: vi.fn(),
  MODELS: { HAIKU: 'claude-haiku-4-5-20250315', SONNET: 'claude-sonnet-4-6-20250514' },
  SimpleQueue: class MockSimpleQueue {
    add<T>(fn: () => Promise<T>): Promise<T> { return fn(); }
  },
}));

import { callClaude } from '../ai/index.js';
import { classifyRules, detectOverlaps } from '../rules-classifier.js';
import type { RawRule } from '../rules-reader.js';
import type { ClassifiedRule } from '../rules-classifier.js';

const mockCallClaude = vi.mocked(callClaude);

function makeRawRule(overrides: Partial<RawRule> = {}): RawRule {
  return {
    filePath: '/project/.claude/rules/security.md',
    content: '# Security rules\nAlways validate input.',
    sourceDir: '.claude/rules',
    fileName: 'security.md',
    ...overrides,
  };
}

const validClaudeResponse = JSON.stringify({
  category: 'security',
  target: 'universal',
  severity: 'HIGH',
  summary: 'Always validate user input',
  keyPatterns: ['validate', 'input', 'sanitize'],
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('classifyRules', () => {
  it('returns empty array for empty input', async () => {
    const result = await classifyRules([]);
    expect(result).toHaveLength(0);
    expect(mockCallClaude).not.toHaveBeenCalled();
  });

  it('classifies a rule correctly using Claude response', async () => {
    mockCallClaude.mockResolvedValue({
      content: validClaudeResponse,
      model: 'claude-haiku-4-5-20250315',
      inputTokens: 100,
      outputTokens: 50,
    });

    const rules = await classifyRules([makeRawRule()]);

    expect(rules).toHaveLength(1);
    expect(rules[0]?.category).toBe('security');
    expect(rules[0]?.severity).toBe('HIGH');
    expect(rules[0]?.target).toBe('universal');
    expect(rules[0]?.summary).toBe('Always validate user input');
    expect(rules[0]?.keyPatterns).toEqual(['validate', 'input', 'sanitize']);
  });

  it('falls back to default classification when Claude returns no JSON', async () => {
    mockCallClaude.mockResolvedValue({
      content: 'Sorry, I cannot classify this.',
      model: 'claude-haiku-4-5-20250315',
      inputTokens: 10,
      outputTokens: 10,
    });

    const rules = await classifyRules([makeRawRule({ fileName: 'weird.md' })]);

    expect(rules).toHaveLength(1);
    expect(rules[0]?.category).toBe('other');
    expect(rules[0]?.severity).toBe('MEDIUM');
    expect(rules[0]?.target).toBe('universal');
    expect(rules[0]?.keyPatterns).toEqual([]);
  });

  it('falls back when Claude call throws an error', async () => {
    mockCallClaude.mockRejectedValue(new Error('API timeout'));

    const rules = await classifyRules([makeRawRule({ fileName: 'failing.md' })]);

    expect(rules).toHaveLength(1);
    expect(rules[0]?.category).toBe('other');
    expect(rules[0]?.fileName).toBe('failing.md');
  });
});

describe('detectOverlaps', () => {
  function makeClassified(fileName: string, keyPatterns: string[]): ClassifiedRule {
    return {
      filePath: `/path/${fileName}`,
      fileName,
      sourceDir: '.claude/rules',
      content: '',
      category: 'security',
      target: 'universal',
      severity: 'MEDIUM',
      summary: '',
      keyPatterns,
      overlaps: [],
    };
  }

  it('detects overlap between two rules with shared patterns above threshold', () => {
    const rules = [
      makeClassified('a.md', ['validate', 'input', 'sanitize']),
      makeClassified('b.md', ['validate', 'input', 'escape']),
    ];

    detectOverlaps(rules, 0.3);

    // intersection={validate,input}=2, union={validate,input,sanitize,escape}=4 → 0.5
    expect(rules[0]?.overlaps).toHaveLength(1);
    expect(rules[0]?.overlaps[0]?.ruleFile).toBe('b.md');
    expect(rules[0]?.overlaps[0]?.similarity).toBeCloseTo(0.5);
    expect(rules[1]?.overlaps[0]?.ruleFile).toBe('a.md');
  });

  it('does not flag overlap when patterns are disjoint', () => {
    const rules = [
      makeClassified('a.md', ['validate', 'input']),
      makeClassified('b.md', ['logging', 'audit']),
    ];

    detectOverlaps(rules, 0.3);

    expect(rules[0]?.overlaps).toHaveLength(0);
    expect(rules[1]?.overlaps).toHaveLength(0);
  });

  it('skips comparison when both rules have empty keyPatterns', () => {
    const rules = [
      makeClassified('a.md', []),
      makeClassified('b.md', []),
    ];

    detectOverlaps(rules, 0.3);

    expect(rules[0]?.overlaps).toHaveLength(0);
    expect(rules[1]?.overlaps).toHaveLength(0);
  });
});

