import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:fs', () => ({
  writeFileSync: vi.fn(),
}));

import { writeFileSync } from 'node:fs';
import { buildSessionContext } from '../context-injector.js';
import type { StorageAdapter } from '../storage/adapter.js';
import type { LearnedPattern } from '../types.js';

const mockWriteFileSync = vi.mocked(writeFileSync);

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
function makePattern(confidence: number, description = 'test pattern'): LearnedPattern {
  return {
    id: crypto.randomUUID(), description, category: 'TYPE_ERROR',
    frequency: 1, confidence, examples: ['example1'],
    firstSeen: now, lastSeen: now, sessionIds: ['s1'],
  };
}

describe('buildSessionContext', () => {
  let storage: StorageAdapter;
  beforeEach(() => { storage = createMockStorage(); vi.clearAllMocks(); });

  it('returns patternsInjected=0 and empty filePath when no patterns', async () => {
    vi.mocked(storage.getPatterns).mockResolvedValue([]);
    const result = await buildSessionContext(storage, '/cwd');
    expect(result.patternsInjected).toBe(0);
    expect(result.filePath).toBe('');
    expect(mockWriteFileSync).not.toHaveBeenCalled();
  });

  it('writes session-context.md file when patterns exist', async () => {
    vi.mocked(storage.getPatterns).mockResolvedValue([makePattern(0.8)]);
    const result = await buildSessionContext(storage, '/cwd');
    expect(result.patternsInjected).toBe(1);
    expect(result.filePath).toContain('session-context.md');
    expect(mockWriteFileSync).toHaveBeenCalledTimes(1);
  });

  it('filters patterns by minConfidence=0.6', async () => {
    vi.mocked(storage.getPatterns).mockResolvedValue([makePattern(0.8)]);
    await buildSessionContext(storage, '/cwd');
    expect(storage.getPatterns).toHaveBeenCalledWith({ minConfidence: 0.6 });
  });

  it('sorts patterns by confidence descending', async () => {
    vi.mocked(storage.getPatterns).mockResolvedValue([
      makePattern(0.7, 'low confidence'),
      makePattern(0.95, 'high confidence'),
    ]);
    await buildSessionContext(storage, '/cwd');
    const content = mockWriteFileSync.mock.calls[0]?.[1] as string;
    const highIdx = content.indexOf('high confidence');
    const lowIdx = content.indexOf('low confidence');
    expect(highIdx).toBeLessThan(lowIdx);
  });

  it('includes examples in output when patterns have them', async () => {
    const pattern = makePattern(0.8);
    pattern.examples = ['ex1', 'ex2'];
    vi.mocked(storage.getPatterns).mockResolvedValue([pattern]);
    await buildSessionContext(storage, '/cwd');
    const content = mockWriteFileSync.mock.calls[0]?.[1] as string;
    expect(content).toContain('ex1');
  });

  it('returns correct patternsInjected count', async () => {
    vi.mocked(storage.getPatterns).mockResolvedValue([
      makePattern(0.8), makePattern(0.9), makePattern(0.7),
    ]);
    const result = await buildSessionContext(storage, '/cwd');
    expect(result.patternsInjected).toBe(3);
  });
});

