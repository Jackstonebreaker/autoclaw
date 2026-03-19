import { createLogger } from './logger.js';
import type { StorageAdapter } from './storage/adapter.js';
import type { AutoClawConfig } from './types.js';
import { analyzeSession, gatherGitData, type AnalyzeSessionOptions } from './session-analyzer.js';
import { detectCrossSessionPatterns } from './pattern-detector.js';
import { generateRuleSuggestions } from './rule-suggester.js';
import { autoApproveHighConfidenceRules, applyAllPendingRules } from './rule-applier.js';
import { scoreSession, detectQualityDegradation } from './quality-scorer.js';
import { buildSessionContext } from './context-injector.js';
import { verifyRuleRegressions } from './regression-verifier.js';
import { emitNotifications } from './notification-emitter.js';
import { checkDocSync } from './doc-syncer.js';
import { syncLinearTickets } from './linear-sync.js';

const logger = createLogger('orchestrator');

export interface PipelineResult {
  sessionId: string;
  steps: Record<string, { status: 'ok' | 'skipped' | 'error'; duration: number; detail?: string }>;
  totalDuration: number;
}

/**
 * Run the full 11-step coding improvement pipeline.
 * All steps are non-blocking — an error in one step does not stop the pipeline.
 */
export async function runPipeline(
  storage: StorageAdapter,
  config: AutoClawConfig,
  options: AnalyzeSessionOptions = {}
): Promise<PipelineResult> {
  const startTime = Date.now();
  const cwd = options.cwd ?? process.cwd();
  const steps: PipelineResult['steps'] = {};

  logger.info('🚀 Starting AutoClaw pipeline (11 steps)');

  // Gather git data early so Step 11 can use the commits string
  const gitData = gatherGitData(options);

  // ── Step 1: Analyze Session ──────────────────────────────────────────────
  let analysis;
  const s1 = Date.now();
  try {
    analysis = await analyzeSession(storage, options);
    steps['1_analyzeSession'] = {
      status: 'ok',
      duration: Date.now() - s1,
      detail: `${analysis.patterns.length} patterns`,
    };
  } catch (error) {
    steps['1_analyzeSession'] = { status: 'error', duration: Date.now() - s1, detail: String(error) };
    logger.error('Step 1 failed', error);
    return { sessionId: 'error', steps, totalDuration: Date.now() - startTime };
  }

  // ── Step 2: Detect Cross-Session Patterns ────────────────────────────────
  const s2 = Date.now();
  try {
    const detection = await detectCrossSessionPatterns(storage, analysis.patterns, analysis.sessionId);
    steps['2_detectPatterns'] = {
      status: 'ok',
      duration: Date.now() - s2,
      detail: `${detection.crossSessionMatches.length} cross-session`,
    };
  } catch (error) {
    steps['2_detectPatterns'] = { status: 'error', duration: Date.now() - s2, detail: String(error) };
    logger.error('Step 2 failed', error);
  }

  // ── Step 3: Generate Rule Suggestions ────────────────────────────────────
  const s3 = Date.now();
  try {
    const suggestions = await generateRuleSuggestions(storage, {
      patterns: analysis.patterns,
      confidenceThreshold: config.suggestionThreshold,
      dryRun: options.dryRun,
    });
    steps['3_generateSuggestions'] = {
      status: 'ok',
      duration: Date.now() - s3,
      detail: `${suggestions.length} suggestions`,
    };
  } catch (error) {
    steps['3_generateSuggestions'] = { status: 'error', duration: Date.now() - s3, detail: String(error) };
    logger.error('Step 3 failed', error);
  }

  // ── Step 4: Auto-Approve High Confidence Rules (threshold 0.70) ──────────
  const s4 = Date.now();
  try {
    const approved = await autoApproveHighConfidenceRules(storage, config);
    steps['4_autoApprove'] = {
      status: 'ok',
      duration: Date.now() - s4,
      detail: `${approved.length} auto-approved`,
    };
  } catch (error) {
    steps['4_autoApprove'] = { status: 'error', duration: Date.now() - s4, detail: String(error) };
    logger.error('Step 4 failed', error);
  }

  // ── Step 5: Apply All Pending Rules ──────────────────────────────────────
  const s5 = Date.now();
  try {
    if (options.dryRun) {
      steps['5_applyRules'] = { status: 'skipped', duration: 0, detail: 'dry-run' };
    } else {
      const applied = await applyAllPendingRules(storage, config, cwd);
      steps['5_applyRules'] = {
        status: 'ok',
        duration: Date.now() - s5,
        detail: `${applied.applied} applied`,
      };
    }
  } catch (error) {
    steps['5_applyRules'] = { status: 'error', duration: Date.now() - s5, detail: String(error) };
    logger.error('Step 5 failed', error);
  }

  // ── Step 6: Detect Quality Degradation ──────────────────────────────────
  const s6 = Date.now();
  try {
    const qualityResult = await scoreSession(storage, analysis);
    await detectQualityDegradation(storage, qualityResult.score, analysis.sessionId);
    steps['6_qualityCheck'] = {
      status: 'ok',
      duration: Date.now() - s6,
      detail: `score: ${(qualityResult.score * 100).toFixed(0)}%, trend: ${qualityResult.trend}`,
    };
  } catch (error) {
    steps['6_qualityCheck'] = { status: 'error', duration: Date.now() - s6, detail: String(error) };
    logger.error('Step 6 failed', error);
  }

  // ── Step 7: Build Session Context ────────────────────────────────────────
  const s7 = Date.now();
  try {
    if (options.dryRun) {
      steps['7_sessionContext'] = { status: 'skipped', duration: 0, detail: 'dry-run' };
    } else {
      const ctx = await buildSessionContext(storage, cwd);
      steps['7_sessionContext'] = {
        status: 'ok',
        duration: Date.now() - s7,
        detail: `${ctx.patternsInjected} patterns injected`,
      };
    }
  } catch (error) {
    steps['7_sessionContext'] = { status: 'error', duration: Date.now() - s7, detail: String(error) };
    logger.error('Step 7 failed', error);
  }

  // ── Step 8: Verify Rule Regressions ──────────────────────────────────────
  const s8 = Date.now();
  try {
    const regression = await verifyRuleRegressions(storage);
    steps['8_regressionCheck'] = {
      status: 'ok',
      duration: Date.now() - s8,
      detail: `${regression.effective} effective, ${regression.ineffective} ineffective`,
    };
  } catch (error) {
    steps['8_regressionCheck'] = { status: 'error', duration: Date.now() - s8, detail: String(error) };
    logger.error('Step 8 failed', error);
  }

  // ── Step 9: Emit Notifications ────────────────────────────────────────────
  const s9 = Date.now();
  try {
    if (options.dryRun) {
      steps['9_notifications'] = { status: 'skipped', duration: 0, detail: 'dry-run' };
    } else {
      const notif = await emitNotifications(storage, cwd);
      steps['9_notifications'] = {
        status: 'ok',
        duration: Date.now() - s9,
        detail: `${notif.emitted} emitted`,
      };
    }
  } catch (error) {
    steps['9_notifications'] = { status: 'error', duration: Date.now() - s9, detail: String(error) };
    logger.error('Step 9 failed', error);
  }

  // ── Step 10: Check Doc Sync ───────────────────────────────────────────────
  const s10 = Date.now();
  try {
    const docSync = await checkDocSync(storage, cwd);
    steps['10_docSync'] = {
      status: 'ok',
      duration: Date.now() - s10,
      detail: `${docSync.missingFromDocs.length} missing from docs`,
    };
  } catch (error) {
    steps['10_docSync'] = { status: 'error', duration: Date.now() - s10, detail: String(error) };
    logger.error('Step 10 failed', error);
  }

  // ── Step 11: Sync Linear Tickets ──────────────────────────────────────────
  const s11 = Date.now();
  try {
    const linearResult = await syncLinearTickets(storage, gitData.commits, config.linearApiKey);
    steps['11_linearSync'] = {
      status: linearResult.enabled ? 'ok' : 'skipped',
      duration: Date.now() - s11,
      detail: linearResult.skippedReason ?? `${linearResult.patternsEnriched} enriched`,
    };
  } catch (error) {
    steps['11_linearSync'] = { status: 'error', duration: Date.now() - s11, detail: String(error) };
    logger.error('Step 11 failed', error);
  }

  const totalDuration = Date.now() - startTime;
  const okCount = Object.values(steps).filter(s => s.status === 'ok').length;
  const errorCount = Object.values(steps).filter(s => s.status === 'error').length;

  logger.info(`✅ Pipeline complete in ${totalDuration}ms — ${okCount} ok, ${errorCount} errors`);

  return { sessionId: analysis.sessionId, steps, totalDuration };
}

