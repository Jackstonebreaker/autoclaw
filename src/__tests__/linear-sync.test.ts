import { describe, it, expect, vi, beforeEach } from 'vitest';
import { extractTicketIds, mapLabelToCategory, fetchClosedTickets, syncLinearTickets } from '../linear-sync.js';
import type { StorageAdapter } from '../storage/adapter.js';
import type { LearnedPattern } from '../types.js';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

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
function makeLearnedPattern(overrides: Partial<LearnedPattern> = {}): LearnedPattern {
  return {
    id: 'pat-1', description: 'Type error', category: 'TYPE_ERROR',
    frequency: 2, confidence: 0.8, examples: [], firstSeen: now, lastSeen: now, sessionIds: ['s1'],
    ...overrides,
  };
}

describe('extractTicketIds', () => {
  it('extracts ticket IDs like FOR-123', () => {
    const ids = extractTicketIds('fix: resolve FOR-123 and ACW-45');
    expect(ids).toContain('FOR-123');
    expect(ids).toContain('ACW-45');
  });

  it('deduplicates repeated ticket IDs', () => {
    const ids = extractTicketIds('feat: FOR-1 fixes FOR-1 again');
    expect(ids).toHaveLength(1);
    expect(ids[0]).toBe('FOR-1');
  });

  it('returns [] when no ticket IDs found', () => {
    expect(extractTicketIds('chore: update deps')).toEqual([]);
  });

  it('does not match lowercase patterns', () => {
    const ids = extractTicketIds('fix: for-123 issue');
    expect(ids).toHaveLength(0);
  });
});

describe('mapLabelToCategory', () => {
  it('maps security label with highest priority', () => {
    expect(mapLabelToCategory(['security', 'bug'])).toBe('security');
  });

  it('maps bug label', () => {
    expect(mapLabelToCategory(['bug'])).toBe('bug');
  });

  it('maps fix label to bug', () => {
    expect(mapLabelToCategory(['fix'])).toBe('bug');
  });

  it('maps refactor label to debt', () => {
    expect(mapLabelToCategory(['refactor'])).toBe('debt');
  });

  it('maps test label', () => {
    expect(mapLabelToCategory(['test'])).toBe('test');
  });

  it('maps doc label', () => {
    expect(mapLabelToCategory(['documentation'])).toBe('docs');
  });

  it('returns general for unknown labels', () => {
    expect(mapLabelToCategory(['unknown'])).toBe('general');
  });
});

describe('fetchClosedTickets', () => {
  beforeEach(() => vi.clearAllMocks());

  it('makes POST request to Linear GraphQL API', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ data: { issues: { nodes: [] } } }),
    });
    await fetchClosedTickets('my-api-key');
    expect(mockFetch).toHaveBeenCalledWith('https://api.linear.app/graphql', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ Authorization: 'my-api-key' }),
    }));
  });

  it('throws on non-ok response', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 401, statusText: 'Unauthorized' });
    await expect(fetchClosedTickets('bad-key')).rejects.toThrow('Linear API error');
  });

  it('returns parsed tickets from API response', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          issues: {
            nodes: [{
              id: 't1', identifier: 'ACW-1', title: 'Fix bug',
              labels: { nodes: [{ name: 'bug' }] }, completedAt: now,
            }],
          },
        },
      }),
    });
    const tickets = await fetchClosedTickets('key');
    expect(tickets).toHaveLength(1);
    expect(tickets[0]?.identifier).toBe('ACW-1');
    expect(tickets[0]?.labels).toContain('bug');
  });
});

describe('syncLinearTickets', () => {
  let storage: StorageAdapter;
  beforeEach(() => { storage = createMockStorage(); vi.clearAllMocks(); });

  it('returns enabled=false when no API key provided', async () => {
    const result = await syncLinearTickets(storage, 'abc commit', undefined);
    expect(result.enabled).toBe(false);
    expect(result.skippedReason).toBe('no API key');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns skipped reason when no ticket IDs in commits', async () => {
    const result = await syncLinearTickets(storage, 'chore: update deps', 'api-key');
    expect(result.enabled).toBe(true);
    expect(result.ticketsFetched).toBe(0);
    expect(result.skippedReason).toBe('no ticket IDs in commits');
  });

  it('enriches patterns when matching tickets found', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          issues: {
            nodes: [{ id: 't1', identifier: 'ACW-1', title: 'Fix type error', labels: { nodes: [{ name: 'bug' }] }, completedAt: now }],
          },
        },
      }),
    });
    vi.mocked(storage.getPatterns).mockResolvedValue([makeLearnedPattern({ category: 'TYPE_ERROR' })]);
    const result = await syncLinearTickets(storage, 'fix: ACW-1 type error', 'api-key');
    expect(result.enabled).toBe(true);
    expect(result.patternsEnriched).toBeGreaterThan(0);
    expect(storage.updatePattern).toHaveBeenCalled();
  });

  it('creates alert when >= 3 bug tickets correlate with pattern', async () => {
    const bugs = [1, 2, 3].map(i => ({
      id: `t${i}`, identifier: `ACW-${i}`, title: `Bug ${i}`,
      labels: { nodes: [{ name: 'bug' }] }, completedAt: now,
    }));
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ data: { issues: { nodes: bugs } } }) });
    vi.mocked(storage.getPatterns).mockResolvedValue([makeLearnedPattern({ category: 'TYPE_ERROR' })]);
    const commits = bugs.map(b => `fix: ${b.identifier}`).join('\n');
    await syncLinearTickets(storage, commits, 'api-key');
    expect(storage.saveAlert).toHaveBeenCalledWith(expect.objectContaining({ type: 'LINEAR_SYNC' }));
  });
});

