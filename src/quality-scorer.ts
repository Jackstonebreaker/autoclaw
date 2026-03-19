import type { StorageAdapter } from './storage/adapter.js';
import type { QualityResult, DegradationResult, SessionAnalysis } from './types.js';
import { createLogger } from './logger.js';

const logger = createLogger('quality-scorer');

/**
 * Calculate quality score for a session (0-1, higher is better)
 */
export function calculateQualityScore(analysis: SessionAnalysis): number {
  if (analysis.patterns.length === 0) return 1.0;

  const highConfidenceErrors = analysis.patterns.filter(p => p.confidence > 0.7).length;
  const errorRate = highConfidenceErrors / Math.max(analysis.commitCount, 1);

  return Math.max(0, Math.min(1, 1 - errorRate));
}

/**
 * Detect quality degradation by comparing rolling average vs baseline
 */
export async function detectQualityDegradation(
  storage: StorageAdapter,
  currentScore: number,
  sessionId: string
): Promise<DegradationResult> {
  const sessions = await storage.getSessions({ limit: 20 });

  if (sessions.length < 5) {
    logger.info('Not enough sessions for degradation detection (need 5+)');
    return { detected: false, currentScore, baselineScore: currentScore, delta: 0 };
  }

  const recent5 = sessions.slice(0, 5);
  const rolling5Avg = recent5.reduce((sum, s) => sum + s.qualityScore, 0) / recent5.length;

  const baseline20 = sessions.reduce((sum, s) => sum + s.qualityScore, 0) / sessions.length;

  const delta = rolling5Avg - baseline20;
  const degradationThreshold = -0.15;

  const detected = delta < degradationThreshold;

  const result: DegradationResult = {
    detected,
    currentScore,
    baselineScore: baseline20,
    delta,
  };

  if (detected) {
    logger.warn(`Quality degradation detected: ${(delta * 100).toFixed(1)}% drop`);
    const alert = {
      id: crypto.randomUUID(),
      type: 'QUALITY_DEGRADATION' as const,
      message: `Quality degradation: rolling avg ${(rolling5Avg * 100).toFixed(0)}% vs baseline ${(baseline20 * 100).toFixed(0)}% (Δ${(delta * 100).toFixed(1)}%)`,
      severity: 'MAJOR' as const,
      data: {
        rolling5Avg: rolling5Avg as unknown,
        baseline20: baseline20 as unknown,
        delta: delta as unknown,
        sessionId: sessionId as unknown,
      },
      createdAt: new Date().toISOString(),
      acknowledged: false,
    };
    await storage.saveAlert(alert);
    result.alert = alert;
  }

  return result;
}

/**
 * Get full quality result for a session
 */
export async function scoreSession(
  storage: StorageAdapter,
  analysis: SessionAnalysis
): Promise<QualityResult> {
  const score = calculateQualityScore(analysis);
  const sessions = await storage.getSessions({ limit: 20 });

  const recent5 = sessions.slice(0, 5);
  const rolling5Avg =
    recent5.length > 0
      ? recent5.reduce((sum, s) => sum + s.qualityScore, 0) / recent5.length
      : score;

  const baseline20 =
    sessions.length > 0
      ? sessions.reduce((sum, s) => sum + s.qualityScore, 0) / sessions.length
      : score;

  const delta = rolling5Avg - baseline20;
  const trend: 'IMPROVING' | 'STABLE' | 'DEGRADING' =
    delta > 0.05 ? 'IMPROVING' : delta < -0.05 ? 'DEGRADING' : 'STABLE';

  return {
    sessionId: analysis.sessionId,
    score,
    rolling5Avg,
    baseline20,
    trend,
  };
}

