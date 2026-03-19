import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:fs', () => ({
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}));

import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { generateUniversalRules } from '../rules-generator.js';
import type { PipelineRule } from '../rules-consolidator.js';
import type { StorageAdapter } from '../storage/adapter.js';

const mockMkdirSync = vi.mocked(mkdirSync);
const mockWriteFileSync = vi.mocked(writeFileSync);
const mockExistsSync = vi.mocked(existsSync);
const mockReadFileSync = vi.mocked(readFileSync);

function makeStorageAdapter(): StorageAdapter {
  return {
    initialize: vi.fn(),
    savePattern: vi.fn(),
    getPatterns: vi.fn(),
    getPatternById: vi.fn(),
    updatePattern: vi.fn(),
    saveRule: vi.fn(),
    getRules: vi.fn(),
    getRuleById: vi.fn(),
    updateRule: vi.fn(),
    saveRuleVersion: vi.fn(),
    getRuleVersions: vi.fn(),
    saveSession: vi.fn(),
    getSessions: vi.fn(),
    getSessionById: vi.fn(),
    saveAlert: vi.fn(),
    getAlerts: vi.fn(),
    acknowledgeAlert: vi.fn(),
    saveConsolidatedRule: vi.fn().mockResolvedValue(undefined),
    getConsolidatedRules: vi.fn(),
    saveSnapshot: vi.fn(),
    getLatestSnapshot: vi.fn(),
    close: vi.fn(),
  } as unknown as StorageAdapter;
}

function makeRule(overrides: Partial<PipelineRule> = {}): PipelineRule {
  return {
    id: 'test-uuid-1234',
    category: 'security',
    severity: 'HIGH',
    target: 'universal',
    title: 'Security rules',
    content: 'Always validate input.',
    summary: 'Validate all user input',
    mergedFrom: ['security.md'],
    universalScore: 70,
    keyPatterns: ['validate', 'input'],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockExistsSync.mockReturnValue(false);
});

describe('generateUniversalRules', () => {
  it('returns zero counts and does nothing for empty rules array', async () => {
    const storage = makeStorageAdapter();
    const result = await generateUniversalRules([], storage, './rules/universal');

    expect(result).toEqual({ filesWritten: 0, filesSkipped: 0 });
    expect(mockMkdirSync).not.toHaveBeenCalled();
  });

  it('creates critical/, high/, and medium/ subdirectories', async () => {
    const storage = makeStorageAdapter();
    await generateUniversalRules([makeRule()], storage, './rules/universal');

    const createdDirs = mockMkdirSync.mock.calls.map(c => c[0] as string);
    expect(createdDirs.some(d => d.endsWith('critical'))).toBe(true);
    expect(createdDirs.some(d => d.endsWith('high'))).toBe(true);
    expect(createdDirs.some(d => d.endsWith('medium'))).toBe(true);
  });

  it('writes a markdown file per rule in the correct severity directory', async () => {
    const storage = makeStorageAdapter();
    const rule = makeRule({ severity: 'HIGH', category: 'security' });
    const result = await generateUniversalRules([rule], storage, './rules/universal');

    expect(result.filesWritten).toBe(1);
    expect(result.filesSkipped).toBe(0);

    const writtenPath = mockWriteFileSync.mock.calls[0]?.[0] as string;
    expect(writtenPath).toContain('high');
    expect(writtenPath).toContain('security.md');
  });

  it('saves rule to storage via saveConsolidatedRule', async () => {
    const storage = makeStorageAdapter();
    await generateUniversalRules([makeRule()], storage, './rules/universal');

    expect(storage.saveConsolidatedRule).toHaveBeenCalledOnce();
    const saved = vi.mocked(storage.saveConsolidatedRule).mock.calls[0]?.[0];
    expect(saved?.id).toBe('test-uuid-1234');
    expect(saved?.title).toBe('Security rules');
    // universalScore is mapped to 0-1 range
    expect(saved?.universalScore).toBeCloseTo(0.7);
  });

  it('skips writing when file already exists with identical content', async () => {
    mockExistsSync.mockReturnValue(true);
    const rule = makeRule();

    // Build the same content the generator would produce so it matches
    const expectedContent = `# ${rule.title}\n\n> Severity: ${rule.severity}\n> Category: ${rule.category}\n> Target: ${rule.target}\n> Universal Score: ${rule.universalScore}/100\n> Sources: ${rule.mergedFrom.join(', ')}\n\n---\n\n${rule.content}\n\n---\n\n*Key patterns: ${rule.keyPatterns.join(', ')}*\n`;
    mockReadFileSync.mockReturnValue(expectedContent);

    const storage = makeStorageAdapter();
    const result = await generateUniversalRules([rule], storage, './rules/universal');

    expect(result.filesSkipped).toBe(1);
    expect(result.filesWritten).toBe(0);
    expect(mockWriteFileSync).not.toHaveBeenCalled();
    expect(storage.saveConsolidatedRule).not.toHaveBeenCalled();
  });
});

