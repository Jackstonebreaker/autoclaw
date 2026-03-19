import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock all module-level dependencies before imports
vi.mock('../rules-reader.js', () => ({ readRules: vi.fn() }));
vi.mock('../rules-classifier.js', () => ({ classifyRules: vi.fn() }));
vi.mock('../rules-consolidator.js', () => ({ consolidateRules: vi.fn() }));
vi.mock('../rules-generator.js', () => ({ generateUniversalRules: vi.fn() }));

import { readRules } from '../rules-reader.js';
import { classifyRules } from '../rules-classifier.js';
import { consolidateRules } from '../rules-consolidator.js';
import { generateUniversalRules } from '../rules-generator.js';
import { auditRules } from '../rules-auditor.js';
import type { StorageAdapter } from '../storage/adapter.js';
import type { RawRule } from '../rules-reader.js';
import type { ClassifiedRule } from '../rules-classifier.js';
import type { ConsolidatedRule } from '../rules-consolidator.js';

const mockReadRules = vi.mocked(readRules);
const mockClassifyRules = vi.mocked(classifyRules);
const mockConsolidateRules = vi.mocked(consolidateRules);
const mockGenerateUniversalRules = vi.mocked(generateUniversalRules);

function makeStorage(): StorageAdapter {
  return {
    initialize: vi.fn().mockResolvedValue(undefined),
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
    getConsolidatedRules: vi.fn().mockResolvedValue([]),
    saveSnapshot: vi.fn(),
    getLatestSnapshot: vi.fn(),
    close: vi.fn().mockResolvedValue(undefined),
  } as unknown as StorageAdapter;
}

function makeRawRule(overrides: Partial<RawRule> = {}): RawRule {
  return {
    filePath: '/project/.claude/rules/security.md',
    content: '# Security\nAlways validate input.',
    sourceDir: '.claude/rules',
    fileName: 'security.md',
    ...overrides,
  };
}

function makeClassifiedRule(overrides: Partial<ClassifiedRule> = {}): ClassifiedRule {
  return {
    filePath: '/project/.claude/rules/security.md',
    fileName: 'security.md',
    sourceDir: '.claude/rules',
    content: '# Security\nAlways validate input.',
    category: 'security',
    target: 'universal',
    severity: 'HIGH',
    summary: 'Validate all user input',
    keyPatterns: ['validate', 'input'],
    overlaps: [],
    ...overrides,
  };
}

function makeConsolidatedRule(overrides: Partial<ConsolidatedRule> = {}): ConsolidatedRule {
  return {
    id: 'uuid-1234',
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
});

describe('auditRules', () => {
  it('returns zero counts when no rules are found', async () => {
    mockReadRules.mockReturnValue([]);
    const storage = makeStorage();

    const result = await auditRules(storage, { cwd: '/project' });

    expect(result.totalRulesScanned).toBe(0);
    expect(result.classified).toBe(0);
    expect(result.consolidated).toBe(0);
    expect(result.generated).toBe(0);
    expect(result.overlapsDetected).toBe(0);
    expect(result.categories).toEqual({});
    expect(result.severities).toEqual({});
    expect(mockClassifyRules).not.toHaveBeenCalled();
  });

  it('runs full pipeline and returns correct counts', async () => {
    const rawRules = [makeRawRule(), makeRawRule({ fileName: 'testing.md' })];
    const classified = [
      makeClassifiedRule({ category: 'security', severity: 'HIGH' }),
      makeClassifiedRule({ category: 'testing', severity: 'MEDIUM', fileName: 'testing.md' }),
    ];
    const consolidated = [makeConsolidatedRule()];

    mockReadRules.mockReturnValue(rawRules);
    mockClassifyRules.mockResolvedValue(classified);
    mockConsolidateRules.mockResolvedValue(consolidated);
    mockGenerateUniversalRules.mockResolvedValue({ filesWritten: 1, filesSkipped: 0 });

    const storage = makeStorage();
    const result = await auditRules(storage, { cwd: '/project' });

    expect(result.totalRulesScanned).toBe(2);
    expect(result.classified).toBe(2);
    expect(result.consolidated).toBe(1);
    expect(result.generated).toBe(1);
    expect(mockGenerateUniversalRules).toHaveBeenCalledWith(consolidated, storage, './rules/universal');
  });

  it('skips generateUniversalRules in dry-run mode', async () => {
    mockReadRules.mockReturnValue([makeRawRule()]);
    mockClassifyRules.mockResolvedValue([makeClassifiedRule()]);
    mockConsolidateRules.mockResolvedValue([makeConsolidatedRule()]);

    const storage = makeStorage();
    const result = await auditRules(storage, { cwd: '/project', dryRun: true });

    expect(result.generated).toBe(0);
    expect(mockGenerateUniversalRules).not.toHaveBeenCalled();
  });

  it('counts categories correctly', async () => {
    mockReadRules.mockReturnValue([makeRawRule(), makeRawRule(), makeRawRule()]);
    mockClassifyRules.mockResolvedValue([
      makeClassifiedRule({ category: 'security' }),
      makeClassifiedRule({ category: 'security' }),
      makeClassifiedRule({ category: 'testing' }),
    ]);
    mockConsolidateRules.mockResolvedValue([makeConsolidatedRule()]);
    mockGenerateUniversalRules.mockResolvedValue({ filesWritten: 1, filesSkipped: 0 });

    const storage = makeStorage();
    const result = await auditRules(storage, { cwd: '/project' });

    expect(result.categories).toEqual({ security: 2, testing: 1 });
  });

  it('counts severities correctly', async () => {
    mockReadRules.mockReturnValue([makeRawRule(), makeRawRule(), makeRawRule()]);
    mockClassifyRules.mockResolvedValue([
      makeClassifiedRule({ severity: 'CRITICAL' }),
      makeClassifiedRule({ severity: 'HIGH' }),
      makeClassifiedRule({ severity: 'HIGH' }),
    ]);
    mockConsolidateRules.mockResolvedValue([makeConsolidatedRule()]);
    mockGenerateUniversalRules.mockResolvedValue({ filesWritten: 1, filesSkipped: 0 });

    const storage = makeStorage();
    const result = await auditRules(storage, { cwd: '/project' });

    expect(result.severities).toEqual({ CRITICAL: 1, HIGH: 2 });
  });

  it('counts overlaps (each pair counted once)', async () => {
    // Rule A overlaps with B, Rule B overlaps with A → overlapsDetected should be 1
    mockReadRules.mockReturnValue([makeRawRule(), makeRawRule({ fileName: 'b.md' })]);
    mockClassifyRules.mockResolvedValue([
      makeClassifiedRule({ overlaps: [{ ruleFile: 'b.md', similarity: 0.5 }] }),
      makeClassifiedRule({ fileName: 'b.md', overlaps: [{ ruleFile: 'security.md', similarity: 0.5 }] }),
    ]);
    mockConsolidateRules.mockResolvedValue([makeConsolidatedRule()]);
    mockGenerateUniversalRules.mockResolvedValue({ filesWritten: 1, filesSkipped: 0 });

    const storage = makeStorage();
    const result = await auditRules(storage, { cwd: '/project' });

    expect(result.overlapsDetected).toBe(1);
  });

  it('uses custom outputDir when provided', async () => {
    mockReadRules.mockReturnValue([makeRawRule()]);
    mockClassifyRules.mockResolvedValue([makeClassifiedRule()]);
    mockConsolidateRules.mockResolvedValue([makeConsolidatedRule()]);
    mockGenerateUniversalRules.mockResolvedValue({ filesWritten: 2, filesSkipped: 0 });

    const storage = makeStorage();
    await auditRules(storage, { cwd: '/project', outputDir: './custom/output' });

    expect(mockGenerateUniversalRules).toHaveBeenCalledWith(
      expect.anything(),
      storage,
      './custom/output',
    );
  });

  it('passes custom cwd to readRules', async () => {
    mockReadRules.mockReturnValue([]);
    const storage = makeStorage();

    await auditRules(storage, { cwd: '/custom/repo' });

    expect(mockReadRules).toHaveBeenCalledWith('/custom/repo', undefined);
  });

  it('returns coveragePercent >= 80 when consolidated >= 80% of scanned', async () => {
    // 4 raw rules → 4 classified → 4 consolidated = 100%
    const rawRules = [
      makeRawRule(),
      makeRawRule({ fileName: 'b.md' }),
      makeRawRule({ fileName: 'c.md' }),
      makeRawRule({ fileName: 'd.md' }),
      makeRawRule({ fileName: 'e.md' }),
    ];
    const classified = rawRules.map((r) => makeClassifiedRule({ fileName: r.fileName }));
    const consolidated = [
      makeConsolidatedRule(),
      makeConsolidatedRule({ id: 'uuid-2' }),
      makeConsolidatedRule({ id: 'uuid-3' }),
      makeConsolidatedRule({ id: 'uuid-4' }),
    ]; // 4/5 = 80%

    mockReadRules.mockReturnValue(rawRules);
    mockClassifyRules.mockResolvedValue(classified);
    mockConsolidateRules.mockResolvedValue(consolidated);
    mockGenerateUniversalRules.mockResolvedValue({ filesWritten: 1, filesSkipped: 0 });

    const storage = makeStorage();
    const result = await auditRules(storage, { cwd: '/project' });

    expect(result.coveragePercent).toBeGreaterThanOrEqual(80);
  });

  it('returns coveragePercent < 80 when consolidated < 80% of scanned', async () => {
    // 5 raw rules → 5 classified → only 1 consolidated = 20%
    const rawRules = [
      makeRawRule(),
      makeRawRule({ fileName: 'b.md' }),
      makeRawRule({ fileName: 'c.md' }),
      makeRawRule({ fileName: 'd.md' }),
      makeRawRule({ fileName: 'e.md' }),
    ];
    const classified = rawRules.map((r) => makeClassifiedRule({ fileName: r.fileName }));
    const consolidated = [makeConsolidatedRule()]; // 1/5 = 20%

    mockReadRules.mockReturnValue(rawRules);
    mockClassifyRules.mockResolvedValue(classified);
    mockConsolidateRules.mockResolvedValue(consolidated);
    mockGenerateUniversalRules.mockResolvedValue({ filesWritten: 1, filesSkipped: 0 });

    const storage = makeStorage();
    const result = await auditRules(storage, { cwd: '/project' });

    expect(result.coveragePercent).toBeLessThan(80);
  });
});

