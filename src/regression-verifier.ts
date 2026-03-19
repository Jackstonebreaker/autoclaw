import { createLogger } from './logger.js';
import type { StorageAdapter } from './storage/adapter.js';

const logger = createLogger('regression-verifier');

export interface RegressionResult {
  rulesChecked: number;
  effective: number;     // Rules that reduced pattern frequency
  ineffective: number;   // Rules that didn't help
  insufficient: number;  // Not enough data to determine
}

/**
 * Verify if applied rules are reducing pattern frequency.
 * Compares average pattern frequency before vs. after each rule was applied.
 */
export async function verifyRuleRegressions(
  storage: StorageAdapter
): Promise<RegressionResult> {
  logger.info('Verifying rule regressions');

  const appliedRules = await storage.getRules({ status: 'APPLIED' });
  const patterns = await storage.getPatterns();
  const sessions = await storage.getSessions({ limit: 10 });

  const result: RegressionResult = {
    rulesChecked: appliedRules.length,
    effective: 0,
    ineffective: 0,
    insufficient: 0,
  };

  if (sessions.length < 3) {
    result.insufficient = appliedRules.length;
    logger.info('Not enough sessions for regression verification (need 3+)');
    return result;
  }

  for (const rule of appliedRules) {
    // Find patterns that this rule targets (by category)
    const relatedPatterns = patterns.filter(p => p.category === rule.category);

    if (relatedPatterns.length === 0) {
      result.insufficient++;
      continue;
    }

    const ruleAppliedAt = rule.appliedAt ? new Date(rule.appliedAt).getTime() : 0;

    const patternsAfterRule = relatedPatterns.filter(p => {
      const lastSeen = new Date(p.lastSeen).getTime();
      return lastSeen > ruleAppliedAt;
    });

    const patternsBeforeRule = relatedPatterns.filter(p => {
      const firstSeen = new Date(p.firstSeen).getTime();
      return firstSeen < ruleAppliedAt;
    });

    if (patternsBeforeRule.length === 0) {
      result.insufficient++;
      continue;
    }

    const avgFreqBefore =
      patternsBeforeRule.reduce((s, p) => s + p.frequency, 0) / patternsBeforeRule.length;
    const avgFreqAfter =
      patternsAfterRule.length > 0
        ? patternsAfterRule.reduce((s, p) => s + p.frequency, 0) / patternsAfterRule.length
        : 0;

    if (avgFreqAfter < avgFreqBefore * 0.8) {
      result.effective++;
      logger.info(
        `Rule "${rule.title}" is effective (freq: ${avgFreqBefore.toFixed(1)} → ${avgFreqAfter.toFixed(1)})`
      );
    } else {
      result.ineffective++;
      logger.warn(
        `Rule "${rule.title}" may be ineffective (freq: ${avgFreqBefore.toFixed(1)} → ${avgFreqAfter.toFixed(1)})`
      );
    }
  }

  logger.info(
    `Regression check: ${result.effective} effective, ${result.ineffective} ineffective, ${result.insufficient} insufficient data`
  );
  return result;
}

