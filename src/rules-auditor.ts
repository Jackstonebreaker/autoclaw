import { createLogger } from './logger.js';
import { readRules } from './rules-reader.js';
import { classifyRules } from './rules-classifier.js';
import { consolidateRules } from './rules-consolidator.js';
import { generateUniversalRules } from './rules-generator.js';
import type { StorageAdapter } from './storage/adapter.js';

const logger = createLogger('rules-auditor');

export interface AuditResult {
  totalRulesScanned: number;
  classified: number;
  consolidated: number;
  generated: number;
  overlapsDetected: number;
  categories: Record<string, number>;
  severities: Record<string, number>;
}

/**
 * Full audit pipeline: read → classify → consolidate → generate
 */
export async function auditRules(
  storage: StorageAdapter,
  options: {
    cwd?: string;
    outputDir?: string;
    customPaths?: string[];
    dryRun?: boolean;
  } = {},
): Promise<AuditResult> {
  const cwd = options.cwd ?? process.cwd();
  const outputDir = options.outputDir ?? './rules/universal';

  logger.info('Starting rules audit');

  // Step 1: Read all rules
  const rawRules = readRules(cwd, options.customPaths);
  logger.info(`Step 1: Read ${rawRules.length} rules`);

  if (rawRules.length === 0) {
    logger.warn('No rules found — nothing to audit');
    return {
      totalRulesScanned: 0,
      classified: 0,
      consolidated: 0,
      generated: 0,
      overlapsDetected: 0,
      categories: {},
      severities: {},
    };
  }

  // Step 2: Classify
  const classified = await classifyRules(rawRules);
  logger.info(`Step 2: Classified ${classified.length} rules`);

  // Count overlaps (each pair is counted twice, once per rule)
  const overlapsDetected = classified.reduce((sum, r) => sum + r.overlaps.length, 0) / 2;

  // Step 3: Consolidate
  const consolidated = await consolidateRules(classified);
  logger.info(`Step 3: Consolidated into ${consolidated.length} rules`);

  // Step 4: Generate (unless dry-run)
  let generated = 0;
  if (!options.dryRun) {
    const genResult = await generateUniversalRules(consolidated, storage, outputDir);
    generated = genResult.filesWritten;
    logger.info(`Step 4: Generated ${generated} files`);
  } else {
    logger.info('Step 4: Skipped (dry-run mode)');
  }

  // Build category/severity stats
  const categories: Record<string, number> = {};
  const severities: Record<string, number> = {};
  for (const rule of classified) {
    categories[rule.category] = (categories[rule.category] ?? 0) + 1;
    severities[rule.severity] = (severities[rule.severity] ?? 0) + 1;
  }

  const result: AuditResult = {
    totalRulesScanned: rawRules.length,
    classified: classified.length,
    consolidated: consolidated.length,
    generated,
    overlapsDetected,
    categories,
    severities,
  };

  logger.info('Rules audit complete', result);
  return result;
}

