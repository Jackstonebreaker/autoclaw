import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  statSync: vi.fn(),
}));

import { readFileSync, statSync } from 'node:fs';
import { extractRuleReferences, isFileStale, checkDocSync } from '../doc-syncer.js';
import type { StorageAdapter } from '../storage/adapter.js';
import type { RuleSuggestion } from '../types.js';

const mockReadFileSync = vi.mocked(readFileSync);
const mockStatSync = vi.mocked(statSync);

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

function makeAppliedRule(title: string): RuleSuggestion {
  return {
    id: crypto.randomUUID(),
    title,
    content: 'content',
    category: 'ERROR_HANDLING',
    severity: 'MAJOR',
    confidence: 0.9,
    status: 'APPLIED',
    sourcePatterns: [],
    targetFiles: [],
    createdAt: now,
    appliedAt: now,
  };
}

describe('extractRuleReferences', () => {
  it('extracts .claude/rules/*.md references', () => {
    const content = 'See .claude/rules/my-rule.md for details';
    const refs = extractRuleReferences(content);
    expect(refs).toContain('.claude/rules/my-rule.md');
  });

  it('extracts .augment/rules/*.md references', () => {
    const content = 'Refer to .augment/rules/test-rule.md';
    const refs = extractRuleReferences(content);
    expect(refs).toContain('.augment/rules/test-rule.md');
  });

  it('extracts .cursor/rules/*.md references', () => {
    const content = 'See .cursor/rules/cursor-rule.md';
    const refs = extractRuleReferences(content);
    expect(refs).toContain('.cursor/rules/cursor-rule.md');
  });

  it('deduplicates repeated references', () => {
    const content = '.claude/rules/foo.md .claude/rules/foo.md';
    const refs = extractRuleReferences(content);
    expect(refs).toHaveLength(1);
  });

  it('returns [] when no references found', () => {
    expect(extractRuleReferences('no references here')).toEqual([]);
  });
});

describe('isFileStale', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns true when file is older than threshold', () => {
    const eightDaysAgo = Date.now() - 8 * 24 * 60 * 60 * 1000;
    mockStatSync.mockReturnValue({ mtimeMs: eightDaysAgo } as ReturnType<typeof statSync>);
    expect(isFileStale('/some/file.md', 7)).toBe(true);
  });

  it('returns false when file is newer than threshold', () => {
    const oneDayAgo = Date.now() - 1 * 24 * 60 * 60 * 1000;
    mockStatSync.mockReturnValue({ mtimeMs: oneDayAgo } as ReturnType<typeof statSync>);
    expect(isFileStale('/some/file.md', 7)).toBe(false);
  });

  it('returns false when file does not exist', () => {
    mockStatSync.mockImplementation(() => { throw new Error('ENOENT'); });
    expect(isFileStale('/nonexistent/file.md')).toBe(false);
  });
});

describe('checkDocSync', () => {
  let storage: StorageAdapter;
  beforeEach(() => { storage = createMockStorage(); vi.clearAllMocks(); });

  it('detects APPLIED rules missing from docs', async () => {
    vi.mocked(storage.getRules).mockResolvedValue([makeAppliedRule('My Missing Rule')]);
    mockReadFileSync.mockReturnValue('# No rule references here' as unknown as Buffer);
    mockStatSync.mockReturnValue({ mtimeMs: Date.now() - 1000 } as ReturnType<typeof statSync>);
    const result = await checkDocSync(storage, '/cwd');
    expect(result.missingFromDocs).toContain('my-missing-rule.md');
  });

  it('continues without error when doc files are absent', async () => {
    vi.mocked(storage.getRules).mockResolvedValue([]);
    mockReadFileSync.mockImplementation(() => { throw new Error('ENOENT'); });
    mockStatSync.mockImplementation(() => { throw new Error('ENOENT'); });
    const result = await checkDocSync(storage, '/cwd');
    expect(result.missingFromDocs).toHaveLength(0);
  });

  it('detects agentsMdStale when AGENTS.md is old', async () => {
    vi.mocked(storage.getRules).mockResolvedValue([]);
    mockReadFileSync.mockReturnValue('' as unknown as Buffer);
    mockStatSync.mockImplementation((path: unknown) => {
      const p = path as string;
      if (p.endsWith('AGENTS.md')) return { mtimeMs: Date.now() - 10 * 24 * 60 * 60 * 1000 } as ReturnType<typeof statSync>;
      return { mtimeMs: Date.now() - 1000 } as ReturnType<typeof statSync>;
    });
    const result = await checkDocSync(storage, '/cwd');
    expect(result.agentsMdStale).toBe(true);
    expect(result.staleDocFiles).toContain('AGENTS.md');
  });

  it('returns empty missingFromDocs when rule is referenced in docs', async () => {
    vi.mocked(storage.getRules).mockResolvedValue([makeAppliedRule('Always Handle Errors')]);
    mockReadFileSync.mockReturnValue('.claude/rules/always-handle-errors.md' as unknown as Buffer);
    mockStatSync.mockReturnValue({ mtimeMs: Date.now() - 1000 } as ReturnType<typeof statSync>);
    const result = await checkDocSync(storage, '/cwd');
    expect(result.missingFromDocs).toHaveLength(0);
  });
});

