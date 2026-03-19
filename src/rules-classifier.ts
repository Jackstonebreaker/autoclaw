import { callClaude, MODELS } from './ai/index.js';
import { SimpleQueue } from './ai/queue.js';
import { createLogger } from './logger.js';
import type { RawRule } from './rules-reader.js';

const logger = createLogger('rules-classifier');
const queue = new SimpleQueue();

export type RuleCategory =
  | 'security' | 'testing' | 'api-routes' | 'typescript' | 'agents'
  | 'git' | 'error-handling' | 'performance' | 'prisma'
  | 'coderabbit' | 'sonarqube' | 'trivy' | 'other';

export type RuleSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM';
export type RuleTarget = 'universal' | 'nextjs-only' | 'agents-only' | 'prisma-only';

export interface ClassifiedRule {
  filePath: string;
  fileName: string;
  sourceDir: string;
  content: string;
  category: RuleCategory;
  target: RuleTarget;
  severity: RuleSeverity;
  summary: string;
  keyPatterns: string[];
  overlaps: { ruleFile: string; similarity: number }[];
}

/**
 * Classify an array of raw rules using Claude Haiku.
 * Detects overlaps between rules using Jaccard similarity on keyPatterns.
 */
export async function classifyRules(rawRules: RawRule[]): Promise<ClassifiedRule[]> {
  if (rawRules.length === 0) return [];

  logger.info(`Classifying ${rawRules.length} rules`);

  const classified: ClassifiedRule[] = [];

  for (const rule of rawRules) {
    try {
      const result = await queue.add(() => classifySingleRule(rule));
      classified.push(result);
    } catch (err) {
      logger.warn(`Failed to classify rule: ${rule.fileName}`, err);
      classified.push({
        ...rule,
        category: 'other',
        target: 'universal',
        severity: 'MEDIUM',
        summary: `Rule from ${rule.fileName}`,
        keyPatterns: [],
        overlaps: [],
      });
    }
  }

  detectOverlaps(classified);

  return classified;
}

async function classifySingleRule(rule: RawRule): Promise<ClassifiedRule> {
  const prompt = `Classify this AI coding rule file. Return ONLY valid JSON.

Rule file: ${rule.fileName}
Content:
${rule.content.slice(0, 2000)}

Return JSON:
{
  "category": "security|testing|api-routes|typescript|agents|git|error-handling|performance|prisma|coderabbit|sonarqube|trivy|other",
  "target": "universal|nextjs-only|agents-only|prisma-only",
  "severity": "CRITICAL|HIGH|MEDIUM",
  "summary": "one-line summary",
  "keyPatterns": ["pattern1", "pattern2"]
}`;

  const result = await callClaude({ prompt, model: MODELS.HAIKU });

  const jsonMatch = result.content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error(`No JSON in Claude response for ${rule.fileName}`);
  }

  const parsed = JSON.parse(jsonMatch[0]) as Partial<{
    category: RuleCategory;
    target: RuleTarget;
    severity: RuleSeverity;
    summary: string;
    keyPatterns: string[];
  }>;

  return {
    filePath: rule.filePath,
    fileName: rule.fileName,
    sourceDir: rule.sourceDir,
    content: rule.content,
    category: parsed.category ?? 'other',
    target: parsed.target ?? 'universal',
    severity: parsed.severity ?? 'MEDIUM',
    summary: parsed.summary ?? '',
    keyPatterns: parsed.keyPatterns ?? [],
    overlaps: [],
  };
}

/**
 * Detect overlaps between classified rules using Jaccard similarity on keyPatterns.
 * Mutates the rules in-place by populating their `overlaps` array.
 */
export function detectOverlaps(rules: ClassifiedRule[], threshold = 0.3): void {
  for (let i = 0; i < rules.length; i++) {
    for (let j = i + 1; j < rules.length; j++) {
      const ruleI = rules[i]!;
      const ruleJ = rules[j]!;

      const setA = new Set(ruleI.keyPatterns.map(p => p.toLowerCase()));
      const setB = new Set(ruleJ.keyPatterns.map(p => p.toLowerCase()));

      if (setA.size === 0 && setB.size === 0) continue;

      const intersection = new Set([...setA].filter(x => setB.has(x)));
      const union = new Set([...setA, ...setB]);
      const similarity = union.size > 0 ? intersection.size / union.size : 0;

      if (similarity >= threshold) {
        ruleI.overlaps.push({ ruleFile: ruleJ.fileName, similarity });
        ruleJ.overlaps.push({ ruleFile: ruleI.fileName, similarity });
      }
    }
  }
}

