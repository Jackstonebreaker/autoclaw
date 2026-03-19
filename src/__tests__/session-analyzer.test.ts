import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:child_process', () => ({ execSync: vi.fn() }));
vi.mock('../ai/index.js', () => ({
  callClaude: vi.fn(),
  MODELS: { HAIKU: 'claude-haiku-4-5-20250315', SONNET: 'claude-sonnet-4-6-20250514' },
}));
vi.mock('../ai/queue.js', () => ({
  SimpleQueue: class MockSimpleQueue {
    add<T>(fn: () => Promise<T>): Promise<T> { return fn(); }
  },
}));

import { execSync } from 'node:child_process';
import { callClaude } from '../ai/index.js';
import { gatherGitData, callClaudeForAnalysis, analyzeSession } from '../session-analyzer.js';
import type { StorageAdapter } from '../storage/adapter.js';

const mockExecSync = vi.mocked(execSync);
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

describe('gatherGitData', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns correct fields with 2 commits', () => {
    const diffOutput = ' src/foo.ts | 5\n src/bar.ts | 3\n 2 files changed, 8 insertions(+)';
    mockExecSync
      .mockReturnValueOnce('abc123 first commit\ndef456 second commit' as unknown as Buffer)
      .mockReturnValueOnce(diffOutput as unknown as Buffer);
    const result = gatherGitData({});
    expect(result.commits).toBe('abc123 first commit\ndef456 second commit');
    expect(result.commitCount).toBe(2);
    expect(result.filesChanged).toBeGreaterThanOrEqual(1);
    expect(result.diff).toContain('src/foo.ts');
  });

  it('returns commitCount=0 when no commits', () => {
    mockExecSync
      .mockReturnValueOnce('' as unknown as Buffer)
      .mockReturnValueOnce('' as unknown as Buffer);
    const result = gatherGitData({});
    expect(result.commitCount).toBe(0);
    expect(result.filesChanged).toBe(0);
  });

  it('uses provided cwd and since options', () => {
    mockExecSync
      .mockReturnValueOnce('xyz commit' as unknown as Buffer)
      .mockReturnValueOnce('' as unknown as Buffer);
    gatherGitData({ cwd: '/tmp/repo', since: '30 days ago' });
    expect(mockExecSync).toHaveBeenCalledWith(
      expect.stringContaining('30 days ago'),
      expect.objectContaining({ cwd: '/tmp/repo' }),
    );
  });

  it('deduplicates files changed', () => {
    mockExecSync
      .mockReturnValueOnce('c1\nc2' as unknown as Buffer)
      .mockReturnValueOnce(' src/foo.ts | 5 ++\n src/foo.ts | 3 --' as unknown as Buffer);
    const result = gatherGitData({});
    expect(result.filesChanged).toBe(1);
  });
});

describe('callClaudeForAnalysis', () => {
  beforeEach(() => vi.clearAllMocks());

  it('parses JSON array from Claude response', async () => {
    const pattern = {
      description: 'Missing error handling',
      category: 'ERROR_HANDLING',
      frequency: 3,
      confidence: 0.85,
      examples: ['example1'],
      firstSeen: new Date().toISOString(),
      lastSeen: new Date().toISOString(),
    };
    mockCallClaude.mockResolvedValue({
      content: JSON.stringify([pattern]),
      model: 'claude-haiku-4-5-20250315',
      inputTokens: 10,
      outputTokens: 20,
    });
    const result = await callClaudeForAnalysis({ commits: 'c1', diff: 'd1' });
    expect(result).toHaveLength(1);
    expect(result[0]?.description).toBe('Missing error handling');
  });

  it('returns [] for invalid JSON', async () => {
    mockCallClaude.mockResolvedValue({
      content: 'not valid json',
      model: 'claude-haiku-4-5-20250315',
      inputTokens: 5,
      outputTokens: 5,
    });
    const result = await callClaudeForAnalysis({ commits: 'c1', diff: 'd1' });
    expect(result).toEqual([]);
  });

  it('returns [] when response is not an array', async () => {
    mockCallClaude.mockResolvedValue({
      content: JSON.stringify({ not: 'an array' }),
      model: 'claude-haiku-4-5-20250315',
      inputTokens: 5,
      outputTokens: 5,
    });
    const result = await callClaudeForAnalysis({ commits: 'c1', diff: 'd1' });
    expect(result).toEqual([]);
  });
});



describe('analyzeSession', () => {
  let storage: ReturnType<typeof createMockStorage>;
  beforeEach(() => {
    storage = createMockStorage();
    vi.clearAllMocks();
  });

  it('returns empty analysis when no commits found', async () => {
    mockExecSync
      .mockReturnValueOnce('' as unknown as Buffer)
      .mockReturnValueOnce('' as unknown as Buffer);
    const result = await analyzeSession(storage, {});
    expect(result.commitCount).toBe(0);
    expect(result.patterns).toEqual([]);
    expect(result.sessionId).toBeTruthy();
  });

  it('does not call Claude when dryRun=true', async () => {
    mockExecSync
      .mockReturnValueOnce('abc commit' as unknown as Buffer)
      .mockReturnValueOnce('' as unknown as Buffer);
    await analyzeSession(storage, { dryRun: true });
    expect(mockCallClaude).not.toHaveBeenCalled();
  });

  it('does not save session when dryRun=true', async () => {
    mockExecSync
      .mockReturnValueOnce('abc commit' as unknown as Buffer)
      .mockReturnValueOnce('' as unknown as Buffer);
    await analyzeSession(storage, { dryRun: true });
    expect(storage.saveSession).not.toHaveBeenCalled();
  });

  it('saves session record when dryRun=false and commits found', async () => {
    mockExecSync
      .mockReturnValueOnce('abc commit' as unknown as Buffer)
      .mockReturnValueOnce('' as unknown as Buffer);
    mockCallClaude.mockResolvedValue({
      content: '[]',
      model: 'claude-haiku-4-5-20250315',
      inputTokens: 5,
      outputTokens: 5,
    });
    await analyzeSession(storage, {});
    expect(storage.saveSession).toHaveBeenCalledTimes(1);
    expect(storage.saveSession).toHaveBeenCalledWith(expect.objectContaining({
      commitRange: '7 days ago',
    }));
  });

  it('returns analysis with patterns from Claude response', async () => {
    mockExecSync
      .mockReturnValueOnce('abc commit' as unknown as Buffer)
      .mockReturnValueOnce('' as unknown as Buffer);
    const now = new Date().toISOString();
    const pattern = {
      description: 'Unhandled promise rejection',
      category: 'ERROR_HANDLING',
      frequency: 2,
      confidence: 0.9,
      examples: ['ex1'],
      firstSeen: now,
      lastSeen: now,
    };
    mockCallClaude.mockResolvedValue({
      content: JSON.stringify([pattern]),
      model: 'claude-haiku-4-5-20250315',
      inputTokens: 10,
      outputTokens: 30,
    });
    const result = await analyzeSession(storage, {});
    expect(result.patterns).toHaveLength(1);
    expect(result.patterns[0]?.description).toBe('Unhandled promise rejection');
  });
});
