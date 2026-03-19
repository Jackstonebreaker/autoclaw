import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockRun, mockAll, mockGet, mockPrepare, mockPragma, mockExec, mockClose } = vi.hoisted(() => {
  const mockRun = vi.fn();
  const mockAll = vi.fn().mockReturnValue([]);
  const mockGet = vi.fn().mockReturnValue(undefined);
  const mockPrepare = vi.fn().mockReturnValue({ run: mockRun, all: mockAll, get: mockGet });
  const mockPragma = vi.fn();
  const mockExec = vi.fn();
  const mockClose = vi.fn();
  return { mockRun, mockAll, mockGet, mockPrepare, mockPragma, mockExec, mockClose };
});

vi.mock('better-sqlite3', () => ({
  default: class MockDatabase {
    prepare(...args: unknown[]) { return mockPrepare(...args); }
    pragma(...args: unknown[]) { return mockPragma(...args); }
    exec(...args: unknown[]) { return mockExec(...args); }
    close(...args: unknown[]) { return mockClose(...args); }
  },
}));
vi.mock('fs', () => ({ mkdirSync: vi.fn() }));

import { SQLiteAdapter } from '../../storage/sqlite-adapter.js';

const now = new Date().toISOString();

describe('SQLiteAdapter', () => {
  let adapter: SQLiteAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAll.mockReturnValue([]);
    mockGet.mockReturnValue(undefined);
    adapter = new SQLiteAdapter('/tmp/test.db');
  });

  describe('initialize()', () => {
    it('creates the database and tables', async () => {
      await adapter.initialize();
      expect(mockPragma).toHaveBeenCalledWith('journal_mode = WAL');
      expect(mockExec).toHaveBeenCalledWith(expect.stringContaining('CREATE TABLE IF NOT EXISTS patterns'));
    });
  });

  describe('savePattern() + getPatterns()', () => {
    it('calls INSERT when saving a pattern', async () => {
      await adapter.initialize();
      await adapter.savePattern({
        id: 'p1', description: 'Test', category: 'TYPE_ERROR',
        frequency: 1, confidence: 0.8, examples: [], firstSeen: now, lastSeen: now, sessionIds: [],
      });
      expect(mockRun).toHaveBeenCalled();
    });

    it('returns mapped patterns from getPatterns', async () => {
      await adapter.initialize();
      mockAll.mockReturnValueOnce([{
        id: 'p1', description: 'Test', category: 'TYPE_ERROR',
        frequency: 1, confidence: 0.8, examples: '[]', firstSeen: now, lastSeen: now, sessionIds: '[]',
      }]);
      const patterns = await adapter.getPatterns();
      expect(patterns).toHaveLength(1);
      expect(patterns[0]?.id).toBe('p1');
    });
  });

  describe('saveRule() + getRules()', () => {
    it('calls INSERT when saving a rule', async () => {
      await adapter.initialize();
      await adapter.saveRule({
        id: 'r1', title: 'Rule', content: 'content', category: 'ERROR_HANDLING',
        severity: 'MAJOR', confidence: 0.9, status: 'PENDING',
        sourcePatterns: [], targetFiles: [], createdAt: now,
      });
      expect(mockRun).toHaveBeenCalled();
    });

    it('returns mapped rules from getRules', async () => {
      await adapter.initialize();
      mockAll.mockReturnValueOnce([{
        id: 'r1', title: 'Rule', content: 'content', category: 'ERROR_HANDLING',
        severity: 'MAJOR', confidence: 0.9, status: 'PENDING',
        sourcePatterns: '[]', targetFiles: '[]', createdAt: now, appliedAt: null,
      }]);
      const rules = await adapter.getRules();
      expect(rules).toHaveLength(1);
      expect(rules[0]?.title).toBe('Rule');
    });
  });

  describe('saveAlert() + getAlerts() + acknowledgeAlert()', () => {
    it('calls INSERT when saving an alert', async () => {
      await adapter.initialize();
      await adapter.saveAlert({
        id: 'a1', type: 'QUALITY_DEGRADATION', message: 'msg',
        severity: 'MAJOR', createdAt: now, acknowledged: false,
      });
      expect(mockRun).toHaveBeenCalled();
    });

    it('returns mapped alerts from getAlerts', async () => {
      await adapter.initialize();
      mockAll.mockReturnValueOnce([{
        id: 'a1', type: 'QUALITY_DEGRADATION', message: 'msg',
        severity: 'MAJOR', data: null, createdAt: now, acknowledged: 0,
      }]);
      const alerts = await adapter.getAlerts();
      expect(alerts).toHaveLength(1);
      expect(alerts[0]?.acknowledged).toBe(false);
    });

    it('calls UPDATE when acknowledging an alert', async () => {
      await adapter.initialize();
      await adapter.acknowledgeAlert('a1');
      expect(mockRun).toHaveBeenCalled();
    });
  });

  describe('saveSession() + getSessions()', () => {
    it('calls INSERT when saving a session', async () => {
      await adapter.initialize();
      await adapter.saveSession({ id: 's1', analyzedAt: now, commitRange: '7d', patternsFound: 2, qualityScore: 0.8, summary: 'test' });
      expect(mockRun).toHaveBeenCalled();
    });

    it('returns mapped sessions from getSessions', async () => {
      await adapter.initialize();
      mockAll.mockReturnValueOnce([{ id: 's1', analyzedAt: now, commitRange: '7d', patternsFound: 2, qualityScore: 0.8, summary: 'test' }]);
      const sessions = await adapter.getSessions();
      expect(sessions).toHaveLength(1);
      expect(sessions[0]?.id).toBe('s1');
    });
  });

  describe('close()', () => {
    it('closes the database connection', async () => {
      await adapter.initialize();
      await adapter.close();
      expect(mockClose).toHaveBeenCalledTimes(1);
    });
  });
});

