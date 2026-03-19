import { describe, it, expect, vi, beforeEach } from 'vitest';
import { verifyRuleRegressions } from '../regression-verifier.js';
import type { StorageAdapter } from '../storage/adapter.js';
import type { RuleSuggestion, LearnedPattern, SessionRecord } from '../types.js';

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

const past = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
const recent = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString();
const now = new Date().toISOString();

function makeRule(overrides: Partial<RuleSuggestion> = {}): RuleSuggestion {
  return {
    id: 'rule-1', title: 'Test Rule', content: 'content',
    category: 'TYPE_ERROR', severity: 'MAJOR', confidence: 0.8,
    status: 'APPLIED', sourcePatterns: [], targetFiles: [],
    createdAt: past, appliedAt: past, ...overrides,
  };
}

function makePattern(overrides: Partial<LearnedPattern> = {}): LearnedPattern {
  return {
    id: 'pat-1', description: 'pattern', category: 'TYPE_ERROR',
    frequency: 5, confidence: 0.8, examples: [],
    firstSeen: past, lastSeen: recent, sessionIds: ['s1'], ...overrides,
  };
}

function makeSession(): SessionRecord {
  return { id: crypto.randomUUID(), analyzedAt: now, commitRange: '7d', patternsFound: 2, qualityScore: 0.8, summary: 'test' };
}

describe('verifyRuleRegressions', () => {
  let storage: StorageAdapter;
  beforeEach(() => { storage = createMockStorage(); vi.clearAllMocks(); });

  it('returns insufficient for all rules when < 3 sessions', async () => {
    vi.mocked(storage.getRules).mockResolvedValue([makeRule()]);
    vi.mocked(storage.getPatterns).mockResolvedValue([makePattern()]);
    vi.mocked(storage.getSessions).mockResolvedValue([makeSession(), makeSession()]);
    const result = await verifyRuleRegressions(storage);
    expect(result.insufficient).toBe(1);
    expect(result.effective).toBe(0);
    expect(result.ineffective).toBe(0);
  });

  it('counts effective rules when frequency decreases by >= 20%', async () => {
    const sessions = [makeSession(), makeSession(), makeSession()];
    vi.mocked(storage.getSessions).mockResolvedValue(sessions);
    vi.mocked(storage.getRules).mockResolvedValue([makeRule({ appliedAt: past })]);
    // Pattern before rule (high freq), pattern after rule (low freq)
    vi.mocked(storage.getPatterns).mockResolvedValue([
      makePattern({ firstSeen: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(), lastSeen: past, frequency: 10 }),
      makePattern({ id: 'pat-2', firstSeen: recent, lastSeen: now, frequency: 1 }),
    ]);
    const result = await verifyRuleRegressions(storage);
    expect(result.effective).toBe(1);
    expect(result.ineffective).toBe(0);
  });

  it('counts ineffective rules when frequency does not decrease significantly', async () => {
    const sessions = [makeSession(), makeSession(), makeSession()];
    vi.mocked(storage.getSessions).mockResolvedValue(sessions);
    vi.mocked(storage.getRules).mockResolvedValue([makeRule({ appliedAt: past })]);
    vi.mocked(storage.getPatterns).mockResolvedValue([
      makePattern({ firstSeen: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(), lastSeen: past, frequency: 5 }),
      makePattern({ id: 'pat-2', firstSeen: recent, lastSeen: now, frequency: 5 }),
    ]);
    const result = await verifyRuleRegressions(storage);
    expect(result.ineffective).toBe(1);
    expect(result.effective).toBe(0);
  });

  it('returns rulesChecked = number of APPLIED rules', async () => {
    vi.mocked(storage.getSessions).mockResolvedValue([makeSession(), makeSession(), makeSession()]);
    vi.mocked(storage.getRules).mockResolvedValue([makeRule(), makeRule({ id: 'rule-2' })]);
    vi.mocked(storage.getPatterns).mockResolvedValue([]);
    const result = await verifyRuleRegressions(storage);
    expect(result.rulesChecked).toBe(2);
  });
});

