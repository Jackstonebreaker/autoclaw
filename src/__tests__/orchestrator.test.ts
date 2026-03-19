import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../session-analyzer.js', () => ({
  gatherGitData: vi.fn().mockReturnValue({ commits: 'abc commit', diff: '', commitCount: 1, filesChanged: 1 }),
  analyzeSession: vi.fn().mockResolvedValue({
    sessionId: 'test-session-id',
    timestamp: new Date().toISOString(),
    patterns: [],
    quality: { errorRate: 0, patternDiversity: 0, improvementTrend: 0, topCategories: [] },
    commitCount: 1,
    filesChanged: 1,
  }),
}));
vi.mock('../pattern-detector.js', () => ({
  detectCrossSessionPatterns: vi.fn().mockResolvedValue({
    newPatterns: [], recurringPatterns: [], crossSessionMatches: [],
  }),
}));
vi.mock('../rule-suggester.js', () => ({
  generateRuleSuggestions: vi.fn().mockResolvedValue([]),
}));
vi.mock('../rule-applier.js', () => ({
  autoApproveHighConfidenceRules: vi.fn().mockResolvedValue([]),
  applyAllPendingRules: vi.fn().mockResolvedValue({ applied: 0, skipped: 0 }),
}));
vi.mock('../quality-scorer.js', () => ({
  scoreSession: vi.fn().mockResolvedValue({ sessionId: 'test', score: 0.9, rolling5Avg: 0.9, baseline20: 0.9, trend: 'STABLE' }),
  detectQualityDegradation: vi.fn().mockResolvedValue({ detected: false, currentScore: 0.9, baselineScore: 0.9, delta: 0 }),
}));
vi.mock('../context-injector.js', () => ({
  buildSessionContext: vi.fn().mockResolvedValue({ patternsInjected: 0, filePath: '' }),
}));
vi.mock('../regression-verifier.js', () => ({
  verifyRuleRegressions: vi.fn().mockResolvedValue({ rulesChecked: 0, effective: 0, ineffective: 0, insufficient: 0 }),
}));
vi.mock('../notification-emitter.js', () => ({
  emitNotifications: vi.fn().mockResolvedValue({ emitted: 0, filePath: '' }),
}));
vi.mock('../doc-syncer.js', () => ({
  checkDocSync: vi.fn().mockResolvedValue({ missingFromDocs: [], staleDocFiles: [], agentsMdStale: false }),
}));
vi.mock('../linear-sync.js', () => ({
  syncLinearTickets: vi.fn().mockResolvedValue({ enabled: false, ticketsFetched: 0, patternsEnriched: 0, skippedReason: 'no API key' }),
}));

import { runPipeline } from '../orchestrator.js';
import { autoApproveHighConfidenceRules, applyAllPendingRules } from '../rule-applier.js';
import { analyzeSession } from '../session-analyzer.js';
import type { StorageAdapter } from '../storage/adapter.js';
import type { AutoClawConfig } from '../types.js';

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

const baseConfig: AutoClawConfig = {
  version: '1.0.0',
  storage: 'file',
  autoApproveThreshold: 0.70,
  suggestionThreshold: 0.70,
  targetDirs: ['.claude/rules'],
};

describe('runPipeline', () => {
  let storage: StorageAdapter;
  beforeEach(() => { storage = createMockStorage(); vi.clearAllMocks(); });

  it('returns PipelineResult with sessionId and steps', async () => {
    const result = await runPipeline(storage, baseConfig, {});
    expect(result.sessionId).toBe('test-session-id');
    expect(result.steps).toBeDefined();
    expect(result.totalDuration).toBeGreaterThanOrEqual(0);
  });

  it('executes all 11 steps', async () => {
    const result = await runPipeline(storage, baseConfig, {});
    expect(Object.keys(result.steps)).toHaveLength(11);
  });

  it('runs step 4 (autoApprove) before step 5 (apply)', async () => {
    const callOrder: string[] = [];
    vi.mocked(autoApproveHighConfidenceRules).mockImplementation(async () => { callOrder.push('step4'); return []; });
    vi.mocked(applyAllPendingRules).mockImplementation(async () => { callOrder.push('step5'); return { applied: 0, skipped: 0 }; });
    await runPipeline(storage, baseConfig, {});
    expect(callOrder.indexOf('step4')).toBeLessThan(callOrder.indexOf('step5'));
  });

  it('step 5 is skipped in dryRun mode', async () => {
    const result = await runPipeline(storage, baseConfig, { dryRun: true });
    expect(result.steps['5_applyRules']?.status).toBe('skipped');
    expect(applyAllPendingRules).not.toHaveBeenCalled();
  });

  it('step 7 is skipped in dryRun mode', async () => {
    const result = await runPipeline(storage, baseConfig, { dryRun: true });
    expect(result.steps['7_sessionContext']?.status).toBe('skipped');
  });

  it('step 9 is skipped in dryRun mode', async () => {
    const result = await runPipeline(storage, baseConfig, { dryRun: true });
    expect(result.steps['9_notifications']?.status).toBe('skipped');
  });

  it('marks step 1 as error and continues with independent steps when step 1 fails', async () => {
    vi.mocked(analyzeSession).mockRejectedValueOnce(new Error('git error'));
    const result = await runPipeline(storage, baseConfig, {});
    // sessionId falls back to 'unknown' when analysis is unavailable
    expect(result.sessionId).toBe('unknown');
    expect(result.steps['1_analyzeSession']?.status).toBe('error');
    // Steps dependent on analysis are skipped gracefully
    expect(result.steps['2_detectPatterns']?.status).toBe('skipped');
    expect(result.steps['3_generateSuggestions']?.status).toBe('skipped');
    expect(result.steps['6_qualityCheck']?.status).toBe('skipped');
    // Independent steps continue running
    expect(result.steps['4_autoApprove']?.status).toBe('ok');
    expect(result.steps['8_regressionCheck']?.status).toBe('ok');
    expect(result.steps['10_docSync']?.status).toBe('ok');
    // All 11 steps are present in the result
    expect(Object.keys(result.steps)).toHaveLength(11);
  });

  it('continues pipeline when non-critical step fails', async () => {
    const { detectCrossSessionPatterns } = await import('../pattern-detector.js');
    vi.mocked(detectCrossSessionPatterns).mockRejectedValueOnce(new Error('pattern error'));
    const result = await runPipeline(storage, baseConfig, {});
    expect(result.steps['2_detectPatterns']?.status).toBe('error');
    expect(result.steps['3_generateSuggestions']?.status).toBe('ok');
  });

  it('step 11 is skipped when no linearApiKey in config', async () => {
    const result = await runPipeline(storage, baseConfig, {});
    expect(result.steps['11_linearSync']?.status).toBe('skipped');
  });
});

