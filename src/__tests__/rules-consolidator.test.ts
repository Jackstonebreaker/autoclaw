import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../ai/index.js', () => ({
  callClaude: vi.fn(),
  MODELS: { HAIKU: 'claude-haiku-4-5-20250315', SONNET: 'claude-sonnet-4-6-20250514' },
  SimpleQueue: class MockSimpleQueue {
    add<T>(fn: () => Promise<T>): Promise<T> { return fn(); }
  },
}));

import { callClaude } from '../ai/index.js';
import { consolidateRules, calculateUniversalScore } from '../rules-consolidator.js';
import type { ClassifiedRule } from '../rules-classifier.js';

const mockCallClaude = vi.mocked(callClaude);

function makeRule(overrides: Partial<ClassifiedRule> = {}): ClassifiedRule {
  return {
    filePath: '/project/.claude/rules/security.md',
    fileName: 'security.md',
    sourceDir: '.claude/rules',
    content: '# Security\nAlways validate input.',
    category: 'security',
    target: 'universal',
    severity: 'HIGH',
    summary: 'Validate all user input',
    keyPatterns: ['validate', 'input', 'sanitize'],
    overlaps: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('consolidateRules', () => {
  it('returns empty array for empty input', async () => {
    const result = await consolidateRules([]);
    expect(result).toHaveLength(0);
    expect(mockCallClaude).not.toHaveBeenCalled();
  });

  it('returns a single rule unchanged when no overlaps meet the threshold', async () => {
    const rule = makeRule({ overlaps: [{ ruleFile: 'other.md', similarity: 0.3 }] });
    const result = await consolidateRules([rule], 0.4);

    expect(result).toHaveLength(1);
    expect(result[0]?.mergedFrom).toEqual(['security.md']);
    expect(mockCallClaude).not.toHaveBeenCalled();
  });

  it('merges two rules whose overlap similarity >= threshold', async () => {
    mockCallClaude.mockResolvedValue({
      content: '# Merged security rule\nValidate and escape input.',
      model: 'claude-sonnet-4-6-20250514',
      inputTokens: 200,
      outputTokens: 80,
    });

    const ruleA = makeRule({
      fileName: 'a.md',
      overlaps: [{ ruleFile: 'b.md', similarity: 0.6 }],
    });
    const ruleB = makeRule({
      fileName: 'b.md',
      overlaps: [{ ruleFile: 'a.md', similarity: 0.6 }],
    });

    const result = await consolidateRules([ruleA, ruleB], 0.4);

    expect(result).toHaveLength(1);
    expect(result[0]?.mergedFrom).toContain('a.md');
    expect(result[0]?.mergedFrom).toContain('b.md');
    expect(result[0]?.content).toBe('# Merged security rule\nValidate and escape input.');
    expect(mockCallClaude).toHaveBeenCalledOnce();
  });

  it('keeps highest severity when merging (CRITICAL > HIGH > MEDIUM)', async () => {
    mockCallClaude.mockResolvedValue({
      content: 'merged',
      model: 'claude-sonnet-4-6-20250514',
      inputTokens: 100,
      outputTokens: 30,
    });

    const ruleA = makeRule({
      fileName: 'a.md',
      severity: 'MEDIUM',
      overlaps: [{ ruleFile: 'b.md', similarity: 0.5 }],
    });
    const ruleB = makeRule({
      fileName: 'b.md',
      severity: 'CRITICAL',
      overlaps: [{ ruleFile: 'a.md', similarity: 0.5 }],
    });

    const result = await consolidateRules([ruleA, ruleB], 0.4);

    expect(result[0]?.severity).toBe('CRITICAL');
  });

  it('does NOT merge rules whose overlap similarity is below threshold', async () => {
    const ruleA = makeRule({
      fileName: 'a.md',
      overlaps: [{ ruleFile: 'b.md', similarity: 0.35 }],
    });
    const ruleB = makeRule({
      fileName: 'b.md',
      overlaps: [{ ruleFile: 'a.md', similarity: 0.35 }],
    });

    const result = await consolidateRules([ruleA, ruleB], 0.4);

    expect(result).toHaveLength(2);
    expect(mockCallClaude).not.toHaveBeenCalled();
  });
});

describe('calculateUniversalScore', () => {
  it('returns 40 for one rule from one source dir', () => {
    const group = [makeRule({ sourceDir: '.claude/rules' })];
    // dirScore = 1*30=30, fileScore = 1*10=10 → 40
    expect(calculateUniversalScore(group)).toBe(40);
  });

  it('increases score with more unique source directories', () => {
    const group = [
      makeRule({ sourceDir: '.claude/rules' }),
      makeRule({ fileName: 'b.md', sourceDir: '.augment/rules' }),
    ];
    // dirScore = 2*30=60, fileScore = 2*10=20, capped at 100 → min(80,100)=80
    expect(calculateUniversalScore(group)).toBe(80);
  });

  it('caps at 100', () => {
    const group = Array.from({ length: 5 }, (_, i) =>
      makeRule({ fileName: `r${i}.md`, sourceDir: `dir${i}` }),
    );
    // dirScore=min(5*30,60)=60, fileScore=min(5*10,40)=40 → 100
    expect(calculateUniversalScore(group)).toBe(100);
  });
});

