import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:fs', () => ({
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

import { writeFileSync, mkdirSync } from 'node:fs';
import { autoApproveHighConfidenceRules, applyApprovedRule, applyAllPendingRules } from '../rule-applier.js';
import type { StorageAdapter } from '../storage/adapter.js';
import type { RuleSuggestion, AutoClawConfig } from '../types.js';

const mockWriteFileSync = vi.mocked(writeFileSync);
const mockMkdirSync = vi.mocked(mkdirSync);

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

function makeRule(overrides: Partial<RuleSuggestion> = {}): RuleSuggestion {
  return {
    id: crypto.randomUUID(),
    title: 'Test Rule',
    content: 'Rule content here',
    category: 'ERROR_HANDLING',
    severity: 'MAJOR',
    confidence: 0.8,
    status: 'PENDING',
    sourcePatterns: [],
    targetFiles: ['.claude/rules', '.augment/rules'],
    createdAt: now,
    ...overrides,
  };
}

const baseConfig: AutoClawConfig = {
  version: '1.0.0',
  storage: 'file',
  autoApproveThreshold: 0.70,
  suggestionThreshold: 0.70,
  targetDirs: ['.claude/rules', '.augment/rules'],
};

describe('autoApproveHighConfidenceRules', () => {
  let storage: StorageAdapter;
  beforeEach(() => { storage = createMockStorage(); vi.clearAllMocks(); });

  it('approves rules with confidence >= threshold', async () => {
    const rule = makeRule({ confidence: 0.75, status: 'PENDING' });
    vi.mocked(storage.getRules).mockResolvedValue([rule]);
    const approved = await autoApproveHighConfidenceRules(storage, baseConfig);
    expect(approved).toHaveLength(1);
    expect(storage.updateRule).toHaveBeenCalledWith(rule.id, { status: 'APPROVED' });
  });

  it('does NOT approve rules with confidence < threshold', async () => {
    const rule = makeRule({ confidence: 0.69, status: 'PENDING' });
    vi.mocked(storage.getRules).mockResolvedValue([rule]);
    const approved = await autoApproveHighConfidenceRules(storage, baseConfig);
    expect(approved).toHaveLength(0);
    expect(storage.updateRule).not.toHaveBeenCalled();
  });

  it('uses config.autoApproveThreshold', async () => {
    const rule = makeRule({ confidence: 0.80, status: 'PENDING' });
    vi.mocked(storage.getRules).mockResolvedValue([rule]);
    const config = { ...baseConfig, autoApproveThreshold: 0.90 };
    const approved = await autoApproveHighConfidenceRules(storage, config);
    expect(approved).toHaveLength(0);
  });

  it('approves at exactly threshold boundary', async () => {
    const rule = makeRule({ confidence: 0.70, status: 'PENDING' });
    vi.mocked(storage.getRules).mockResolvedValue([rule]);
    const approved = await autoApproveHighConfidenceRules(storage, baseConfig);
    expect(approved).toHaveLength(1);
  });
});

describe('applyApprovedRule', () => {
  beforeEach(() => vi.clearAllMocks());

  it('writes rule to each target directory', () => {
    const rule = makeRule({ title: 'My Test Rule' });
    const paths = applyApprovedRule(rule, ['.claude/rules', '.augment/rules'], '/cwd');
    expect(paths).toHaveLength(2);
    expect(mockMkdirSync).toHaveBeenCalledTimes(2);
    expect(mockWriteFileSync).toHaveBeenCalledTimes(2);
  });

  it('creates directories with recursive flag', () => {
    applyApprovedRule(makeRule(), ['.claude/rules'], '/cwd');
    expect(mockMkdirSync).toHaveBeenCalledWith(expect.any(String), { recursive: true });
  });

  it('generates kebab-case filename from title', () => {
    applyApprovedRule(makeRule({ title: 'Always Use Types!' }), ['.claude/rules'], '/cwd');
    const writeCall = mockWriteFileSync.mock.calls[0];
    expect(writeCall?.[0]).toMatch(/always-use-types\.md/);
  });

  it('includes rule content in written file', () => {
    applyApprovedRule(makeRule({ content: 'Special rule content' }), ['.claude/rules'], '/cwd');
    const content = mockWriteFileSync.mock.calls[0]?.[1] as string;
    expect(content).toContain('Special rule content');
  });
});

describe('applyAllPendingRules', () => {
  let storage: StorageAdapter;
  beforeEach(() => { storage = createMockStorage(); vi.clearAllMocks(); });

  it('applies all APPROVED rules', async () => {
    const rules = [makeRule({ status: 'APPROVED' }), makeRule({ status: 'APPROVED' })];
    vi.mocked(storage.getRules).mockResolvedValue(rules);
    const result = await applyAllPendingRules(storage, baseConfig, '/cwd');
    expect(result.applied).toBe(2);
    expect(result.skipped).toBe(0);
  });

  it('saves RuleVersion for each applied rule', async () => {
    vi.mocked(storage.getRules).mockResolvedValue([makeRule({ status: 'APPROVED' })]);
    await applyAllPendingRules(storage, baseConfig, '/cwd');
    expect(storage.saveRuleVersion).toHaveBeenCalledTimes(1);
    expect(storage.saveRuleVersion).toHaveBeenCalledWith(expect.objectContaining({ version: 1 }));
  });

  it('increments skipped count when writeFileSync throws', async () => {
    vi.mocked(storage.getRules).mockResolvedValue([makeRule({ status: 'APPROVED' })]);
    mockWriteFileSync.mockImplementationOnce(() => { throw new Error('disk full'); });
    const result = await applyAllPendingRules(storage, baseConfig, '/cwd');
    expect(result.skipped).toBe(1);
    expect(result.applied).toBe(0);
  });
});

