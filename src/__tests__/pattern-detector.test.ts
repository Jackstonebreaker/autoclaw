import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  jaccardSimilarity,
  groupPatternsSemantically,
  detectCrossSessionPatterns,
} from '../pattern-detector.js';
import type { StorageAdapter } from '../storage/adapter.js';
import type { SessionPattern, LearnedPattern } from '../types.js';

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

function makePattern(overrides: Partial<SessionPattern> = {}): SessionPattern {
  return {
    description: 'Test pattern',
    category: 'TYPE_ERROR',
    frequency: 1,
    confidence: 0.8,
    examples: [],
    firstSeen: new Date().toISOString(),
    lastSeen: new Date().toISOString(),
    ...overrides,
  };
}

function makeLearnedPattern(overrides: Partial<LearnedPattern> = {}): LearnedPattern {
  return {
    id: 'pat-1',
    description: 'Test pattern',
    category: 'TYPE_ERROR',
    frequency: 1,
    confidence: 0.8,
    examples: [],
    firstSeen: new Date().toISOString(),
    lastSeen: new Date().toISOString(),
    sessionIds: ['session-1'],
    ...overrides,
  };
}

describe('jaccardSimilarity', () => {
  it('returns 1.0 for identical sets', () => {
    expect(jaccardSimilarity(['a', 'b', 'c'], ['a', 'b', 'c'])).toBe(1.0);
  });

  it('returns 0.0 for disjoint sets', () => {
    expect(jaccardSimilarity(['a', 'b'], ['c', 'd'])).toBe(0.0);
  });

  it('returns 0.0 for empty sets', () => {
    expect(jaccardSimilarity([], [])).toBe(0.0);
  });

  it('returns correct value for partially overlapping sets', () => {
    const result = jaccardSimilarity(['a', 'b', 'c'], ['b', 'c', 'd']);
    // intersection={b,c}=2, union={a,b,c,d}=4 → 0.5
    expect(result).toBeCloseTo(0.5);
  });

  it('handles duplicates in input arrays', () => {
    const result = jaccardSimilarity(['a', 'a', 'b'], ['a', 'b', 'b']);
    expect(result).toBe(1.0);
  });
});

describe('groupPatternsSemantically', () => {
  it('groups patterns by category', () => {
    const patterns = [
      makePattern({ category: 'TYPE_ERROR', description: 'p1' }),
      makePattern({ category: 'TYPE_ERROR', description: 'p2' }),
      makePattern({ category: 'LOGIC_ERROR', description: 'p3' }),
    ];
    const groups = groupPatternsSemantically(patterns);
    expect(groups.get('TYPE_ERROR')).toHaveLength(2);
    expect(groups.get('LOGIC_ERROR')).toHaveLength(1);
  });

  it('returns empty map for empty input', () => {
    expect(groupPatternsSemantically([])).toEqual(new Map());
  });
});

describe('detectCrossSessionPatterns', () => {
  let storage: StorageAdapter;

  beforeEach(() => {
    storage = createMockStorage();
    vi.clearAllMocks();
  });

  it('saves new pattern when no existing patterns match', async () => {
    vi.mocked(storage.getPatterns).mockResolvedValue([]);
    const patterns = [makePattern({ description: 'completely new pattern' })];
    const result = await detectCrossSessionPatterns(storage, patterns, 'session-2');
    expect(result.newPatterns).toHaveLength(1);
    expect(result.recurringPatterns).toHaveLength(0);
    expect(storage.savePattern).toHaveBeenCalledTimes(1);
  });

  it('detects recurring pattern with similarity >= 0.5', async () => {
    const existing = makeLearnedPattern({ description: 'missing type annotation in function' });
    vi.mocked(storage.getPatterns).mockResolvedValue([existing]);
    const current = makePattern({ description: 'missing type annotation in function' });
    const result = await detectCrossSessionPatterns(storage, [current], 'session-2');
    expect(result.recurringPatterns).toHaveLength(1);
    expect(result.newPatterns).toHaveLength(0);
    expect(storage.updatePattern).toHaveBeenCalledWith(existing.id, expect.objectContaining({
      frequency: expect.any(Number),
    }));
  });

  it('updates frequency when recurring pattern found', async () => {
    const existing = makeLearnedPattern({ frequency: 5, description: 'null pointer exception handling error' });
    vi.mocked(storage.getPatterns).mockResolvedValue([existing]);
    const current = makePattern({ frequency: 2, description: 'null pointer exception handling error' });
    await detectCrossSessionPatterns(storage, [current], 'session-2');
    expect(storage.updatePattern).toHaveBeenCalledWith(existing.id, expect.objectContaining({
      frequency: 7,
    }));
  });

  it('returns empty result for empty patterns list', async () => {
    vi.mocked(storage.getPatterns).mockResolvedValue([]);
    const result = await detectCrossSessionPatterns(storage, [], 'session-1');
    expect(result.newPatterns).toHaveLength(0);
    expect(result.recurringPatterns).toHaveLength(0);
    expect(result.crossSessionMatches).toHaveLength(0);
  });

  it('skips cross-category comparison', async () => {
    const existing = makeLearnedPattern({ category: 'LOGIC_ERROR', description: 'test pattern abc' });
    vi.mocked(storage.getPatterns).mockResolvedValue([existing]);
    const current = makePattern({ category: 'TYPE_ERROR', description: 'test pattern abc' });
    const result = await detectCrossSessionPatterns(storage, [current], 'session-2');
    expect(result.newPatterns).toHaveLength(1);
    expect(result.recurringPatterns).toHaveLength(0);
  });
});

