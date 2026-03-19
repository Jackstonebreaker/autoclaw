import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createLogger } from './logger.js';
import type { StorageAdapter } from './storage/adapter.js';
import type { ConsolidatedRule as StorageRule } from './types.js';
import type { PipelineRule } from './rules-consolidator.js';

const logger = createLogger('rules-generator');

/**
 * Generate universal rules as markdown files organised by severity.
 * Idempotent: skips files whose content has not changed.
 */
export async function generateUniversalRules(
  rules: PipelineRule[],
  storage: StorageAdapter,
  outputDir = './rules/universal',
): Promise<{ filesWritten: number; filesSkipped: number }> {
  if (rules.length === 0) {
    logger.info('No rules to generate');
    return { filesWritten: 0, filesSkipped: 0 };
  }

  logger.info(`Generating ${rules.length} universal rules to ${outputDir}`);

  // Create directory structure: critical/, high/, medium/
  for (const severity of ['critical', 'high', 'medium']) {
    mkdirSync(join(outputDir, severity), { recursive: true });
  }

  let filesWritten = 0;
  let filesSkipped = 0;

  for (const rule of rules) {
    const severityDir = rule.severity.toLowerCase();
    const fileName = `${rule.category}.md`;
    const filePath = join(outputDir, severityDir, fileName);
    const content = buildRuleFile(rule);

    // Skip if file exists with identical content (idempotent)
    if (existsSync(filePath)) {
      const existing = readFileSync(filePath, 'utf-8');
      if (existing === content) {
        logger.info(`Skipping unchanged: ${filePath}`);
        filesSkipped++;
        continue;
      }
    }

    try {
      writeFileSync(filePath, content, 'utf-8');
      filesWritten++;
      logger.info(`Written: ${filePath}`);

      await storage.saveConsolidatedRule(toStorageRule(rule));
    } catch (err) {
      logger.error(`Failed to write: ${filePath}`, err);
    }
  }

  logger.info(`Generated ${filesWritten} files, skipped ${filesSkipped}`);
  return { filesWritten, filesSkipped };
}

function buildRuleFile(rule: PipelineRule): string {
  return `# ${rule.title}

> Severity: ${rule.severity}
> Category: ${rule.category}
> Target: ${rule.target}
> Universal Score: ${rule.universalScore}/100
> Sources: ${rule.mergedFrom.join(', ')}

---

${rule.content}

---

*Key patterns: ${rule.keyPatterns.join(', ')}*
`;
}

/** Map local PipelineRule to the types.ts ConsolidatedRule expected by StorageAdapter. */
function toStorageRule(rule: PipelineRule): StorageRule {
  return {
    id: rule.id,
    title: rule.title,
    content: rule.content,
    classification: {
      category: mapCategory(rule.category),
      severity: mapSeverity(rule.severity),
      targetIDE: mapTarget(rule.target),
      isProjectSpecific: rule.target !== 'universal',
      universalScore: rule.universalScore / 100,
    },
    sourceRules: rule.mergedFrom,
    universalScore: rule.universalScore / 100,
    createdAt: new Date().toISOString(),
  };
}

function mapCategory(category: string): StorageRule['classification']['category'] {
  const map: Record<string, StorageRule['classification']['category']> = {
    security: 'SECURITY',
    testing: 'TESTING',
    'api-routes': 'ARCHITECTURE',
    typescript: 'TYPE_ERROR',
    agents: 'OTHER',
    git: 'OTHER',
    'error-handling': 'ERROR_HANDLING',
    performance: 'PERFORMANCE',
    prisma: 'DEPENDENCY',
    coderabbit: 'OTHER',
    sonarqube: 'OTHER',
    trivy: 'SECURITY',
    other: 'OTHER',
  };
  return map[category] ?? 'OTHER';
}

function mapSeverity(severity: string): StorageRule['classification']['severity'] {
  const map: Record<string, StorageRule['classification']['severity']> = {
    CRITICAL: 'CRITICAL',
    HIGH: 'MAJOR',
    MEDIUM: 'MINOR',
  };
  return map[severity] ?? 'MINOR';
}

function mapTarget(target: string): StorageRule['classification']['targetIDE'] {
  const map: Record<string, StorageRule['classification']['targetIDE']> = {
    universal: 'universal',
    'nextjs-only': 'cursor',
    'agents-only': 'claude',
    'prisma-only': 'cursor',
  };
  return map[target] ?? 'universal';
}

