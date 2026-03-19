import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockMkdirSync, mockExistsSync, mockReadFileSync, mockWriteFileSync } = vi.hoisted(() => ({
  mockMkdirSync: vi.fn(),
  mockExistsSync: vi.fn().mockReturnValue(true),
  mockReadFileSync: vi.fn(),
  mockWriteFileSync: vi.fn(),
}));

vi.mock('fs', () => ({
  mkdirSync: mockMkdirSync,
  existsSync: mockExistsSync,
  readFileSync: mockReadFileSync,
  writeFileSync: mockWriteFileSync,
}));

import { FileAdapter } from '../../storage/file-adapter.js';

const now = new Date().toISOString();

// Default empty collections JSON
const emptyCollections: Record<string, string> = {
  'patterns.json': '[]',
  'rules.json': '[]',
  'rule-versions.json': '[]',
  'sessions.json': '[]',
  'alerts.json': '[]',
  'consolidated-rules.json': '[]',
  'snapshots.json': '[]',
};

function setupReadFileMock(overrides: Record<string, string> = {}): void {
  const data = { ...emptyCollections, ...overrides };
  mockReadFileSync.mockImplementation((path: unknown) => {
    const p = path as string;
    for (const [key, val] of Object.entries(data)) {
      if (p.endsWith(key)) return val;
    }
    return '[]';
  });
}

describe('FileAdapter', () => {
  let adapter: FileAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    mockExistsSync.mockReturnValue(true);
    setupReadFileMock();
    adapter = new FileAdapter('/tmp/test-data');
  });

  describe('initialize()', () => {
    it('creates the data directory', async () => {
      mockExistsSync.mockReturnValue(false);
      await adapter.initialize();
      expect(mockMkdirSync).toHaveBeenCalledWith('/tmp/test-data', { recursive: true });
    });

    it('creates JSON files for each collection when missing', async () => {
      mockExistsSync.mockReturnValue(false);
      await adapter.initialize();
      expect(mockWriteFileSync).toHaveBeenCalledWith(expect.stringContaining('patterns.json'), '[]', 'utf-8');
    });
  });

  describe('savePattern() + getPatterns()', () => {
    it('saves and retrieves a pattern', async () => {
      const pattern = {
        id: 'p1', description: 'Test', category: 'TYPE_ERROR' as const,
        frequency: 1, confidence: 0.8, examples: [], firstSeen: now, lastSeen: now, sessionIds: [],
      };
      setupReadFileMock({ 'patterns.json': JSON.stringify([pattern]) });
      const all = await adapter.getPatterns();
      expect(all).toHaveLength(1);
      expect(all[0]?.id).toBe('p1');
    });

    it('filters patterns by category', async () => {
      const patterns = [
        { id: 'p1', description: 'A', category: 'TYPE_ERROR' as const, frequency: 1, confidence: 0.8, examples: [], firstSeen: now, lastSeen: now, sessionIds: [] },
        { id: 'p2', description: 'B', category: 'LOGIC_ERROR' as const, frequency: 1, confidence: 0.7, examples: [], firstSeen: now, lastSeen: now, sessionIds: [] },
      ];
      setupReadFileMock({ 'patterns.json': JSON.stringify(patterns) });
      const result = await adapter.getPatterns({ category: 'TYPE_ERROR' });
      expect(result).toHaveLength(1);
      expect(result[0]?.category).toBe('TYPE_ERROR');
    });
  });

  describe('saveRule() + getRules()', () => {
    it('saves and retrieves a rule', async () => {
      const rule = {
        id: 'r1', title: 'Rule', content: 'content', category: 'ERROR_HANDLING' as const,
        severity: 'MAJOR' as const, confidence: 0.9, status: 'PENDING' as const,
        sourcePatterns: [], targetFiles: [], createdAt: now,
      };
      setupReadFileMock({ 'rules.json': JSON.stringify([rule]) });
      const all = await adapter.getRules();
      expect(all).toHaveLength(1);
      expect(all[0]?.title).toBe('Rule');
    });

    it('filters rules by status', async () => {
      const rules = [
        { id: 'r1', title: 'R1', content: '', category: 'OTHER' as const, severity: 'INFO' as const, confidence: 0.8, status: 'PENDING' as const, sourcePatterns: [], targetFiles: [], createdAt: now },
        { id: 'r2', title: 'R2', content: '', category: 'OTHER' as const, severity: 'INFO' as const, confidence: 0.8, status: 'APPROVED' as const, sourcePatterns: [], targetFiles: [], createdAt: now },
      ];
      setupReadFileMock({ 'rules.json': JSON.stringify(rules) });
      const result = await adapter.getRules({ status: 'APPROVED' });
      expect(result).toHaveLength(1);
      expect(result[0]?.status).toBe('APPROVED');
    });
  });

  describe('saveSession() + getSessions()', () => {
    it('saves and retrieves sessions sorted by analyzedAt desc', async () => {
      const older = { id: 's1', analyzedAt: '2024-01-01T00:00:00.000Z', commitRange: '7d', patternsFound: 0, qualityScore: 0.8, summary: 'old' };
      const newer = { id: 's2', analyzedAt: '2024-06-01T00:00:00.000Z', commitRange: '7d', patternsFound: 0, qualityScore: 0.9, summary: 'new' };
      setupReadFileMock({ 'sessions.json': JSON.stringify([older, newer]) });
      const sessions = await adapter.getSessions();
      expect(sessions[0]?.id).toBe('s2');
    });
  });

  describe('close()', () => {
    it('resolves without error (no-op)', async () => {
      await expect(adapter.close()).resolves.toBeUndefined();
    });
  });
});

