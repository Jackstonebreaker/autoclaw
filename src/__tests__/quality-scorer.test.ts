import { describe, it, expect, vi, beforeEach } from 'vitest';
import { calculateQualityScore, detectQualityDegradation, scoreSession } from '../quality-scorer.js';
import type { StorageAdapter } from '../storage/adapter.js';
import type { SessionAnalysis, SessionRecord } from '../types.js';

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

function makeAnalysis(overrides: Partial<SessionAnalysis> = {}): SessionAnalysis {
  return {
    sessionId: 'sess-1',
    timestamp: now,
    patterns: [],
    quality: { errorRate: 0, patternDiversity: 0, improvementTrend: 0, topCategories: [] },
    commitCount: 5,
    filesChanged: 3,
    ...overrides,
  };
}

function makeSession(qualityScore: number): SessionRecord {
  return {
    id: crypto.randomUUID(),
    analyzedAt: now,
    commitRange: '7 days ago',
    patternsFound: 0,
    qualityScore,
    summary: 'test',
  };
}

describe('calculateQualityScore', () => {
  it('returns 1.0 when no patterns found', () => {
    expect(calculateQualityScore(makeAnalysis({ patterns: [] }))).toBe(1.0);
  });

  it('reduces score based on high-confidence error patterns', () => {
    const patterns = [
      { description: 'p1', category: 'TYPE_ERROR' as const, frequency: 1, confidence: 0.9, examples: [], firstSeen: now, lastSeen: now },
      { description: 'p2', category: 'LOGIC_ERROR' as const, frequency: 1, confidence: 0.4, examples: [], firstSeen: now, lastSeen: now },
    ];
    const analysis = makeAnalysis({ patterns, commitCount: 10 });
    const score = calculateQualityScore(analysis);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThan(1.0);
  });

  it('clamps score to [0, 1]', () => {
    const patterns = Array.from({ length: 10 }, (_, i) => ({
      description: `p${i}`, category: 'TYPE_ERROR' as const, frequency: 1,
      confidence: 0.95, examples: [], firstSeen: now, lastSeen: now,
    }));
    const analysis = makeAnalysis({ patterns, commitCount: 1 });
    const score = calculateQualityScore(analysis);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });
});

describe('detectQualityDegradation', () => {
  let storage: StorageAdapter;
  beforeEach(() => { storage = createMockStorage(); vi.clearAllMocks(); });

  it('returns detected=false when < 5 sessions exist', async () => {
    vi.mocked(storage.getSessions).mockResolvedValue([makeSession(0.8), makeSession(0.7)]);
    const result = await detectQualityDegradation(storage, 0.5, 'sess-1');
    expect(result.detected).toBe(false);
  });

  it('detects degradation when rolling avg drops > 15% below baseline', async () => {
    const sessions = [
      makeSession(0.3), makeSession(0.35), makeSession(0.32), makeSession(0.31), makeSession(0.33),
      makeSession(0.9), makeSession(0.88), makeSession(0.85), makeSession(0.87), makeSession(0.89),
    ];
    vi.mocked(storage.getSessions).mockResolvedValue(sessions);
    const result = await detectQualityDegradation(storage, 0.32, 'sess-1');
    expect(result.detected).toBe(true);
    expect(result.alert).toBeDefined();
    expect(storage.saveAlert).toHaveBeenCalledTimes(1);
  });

  it('does not detect degradation when scores are stable', async () => {
    const sessions = Array.from({ length: 10 }, () => makeSession(0.85));
    vi.mocked(storage.getSessions).mockResolvedValue(sessions);
    const result = await detectQualityDegradation(storage, 0.85, 'sess-1');
    expect(result.detected).toBe(false);
    expect(storage.saveAlert).not.toHaveBeenCalled();
  });
});

describe('scoreSession', () => {
  let storage: StorageAdapter;
  beforeEach(() => { storage = createMockStorage(); vi.clearAllMocks(); });

  it('returns IMPROVING trend when rolling avg > baseline', async () => {
    const sessions = [
      makeSession(0.95), makeSession(0.92), makeSession(0.90), makeSession(0.91), makeSession(0.93),
      makeSession(0.6), makeSession(0.65), makeSession(0.62),
    ];
    vi.mocked(storage.getSessions).mockResolvedValue(sessions);
    const result = await scoreSession(storage, makeAnalysis({ patterns: [] }));
    expect(result.trend).toBe('IMPROVING');
  });

  it('returns DEGRADING trend when rolling avg < baseline by > 5%', async () => {
    const sessions = [
      makeSession(0.5), makeSession(0.52), makeSession(0.48), makeSession(0.51), makeSession(0.49),
      makeSession(0.9), makeSession(0.88), makeSession(0.92),
    ];
    vi.mocked(storage.getSessions).mockResolvedValue(sessions);
    const result = await scoreSession(storage, makeAnalysis({ patterns: [] }));
    expect(result.trend).toBe('DEGRADING');
  });

  it('returns STABLE trend when scores are similar', async () => {
    const sessions = Array.from({ length: 8 }, () => makeSession(0.8));
    vi.mocked(storage.getSessions).mockResolvedValue(sessions);
    const result = await scoreSession(storage, makeAnalysis({ patterns: [] }));
    expect(result.trend).toBe('STABLE');
    expect(result.sessionId).toBe('sess-1');
  });

  it('returns sessionId from the analysis', async () => {
    vi.mocked(storage.getSessions).mockResolvedValue([]);
    const result = await scoreSession(storage, makeAnalysis({ sessionId: 'my-session' }));
    expect(result.sessionId).toBe('my-session');
  });
});

