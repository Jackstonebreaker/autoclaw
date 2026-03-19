import { callClaude, MODELS } from './ai/index.js';
import { SimpleQueue } from './ai/queue.js';
import { createLogger } from './logger.js';
import type { ClassifiedRule } from './types.js';

const logger = createLogger('rules-consolidator');
const queue = new SimpleQueue();

/** Local pipeline rule — distinct from types.ts ConsolidatedRule (storage format). */
export interface PipelineRule {
  id: string;
  category: string;
  severity: string;
  target: string;
  title: string;
  content: string;
  summary: string;
  /** Source file names that were merged into this rule */
  mergedFrom: string[];
  /** 0–100 score: how many source dirs / files contain this rule */
  universalScore: number;
  keyPatterns: string[];
}

/**
 * Consolidate classified rules — merge overlapping rules (similarity >= overlapThreshold).
 * Returns one PipelineRule per connected component.
 */
export async function consolidateRules(
  classifiedRules: ClassifiedRule[],
  overlapThreshold = 0.4,
): Promise<PipelineRule[]> {
  if (classifiedRules.length === 0) return [];

  logger.info(`Consolidating ${classifiedRules.length} rules (threshold: ${overlapThreshold})`);

  const groups = groupOverlappingRules(classifiedRules, overlapThreshold);
  const consolidated: PipelineRule[] = [];

  for (const group of groups) {
    if (group.length === 1) {
      const rule = group[0]!;
      consolidated.push({
        id: crypto.randomUUID(),
        category: rule.category,
        severity: rule.severity,
        target: rule.target,
        title: rule.summary || rule.fileName.replace('.md', ''),
        content: rule.content,
        summary: rule.summary,
        mergedFrom: [rule.fileName],
        universalScore: calculateUniversalScore(group),
        keyPatterns: rule.keyPatterns,
      });
    } else {
      const merged = await mergeRuleGroup(group);
      consolidated.push(merged);
    }
  }

  logger.info(`Consolidated ${classifiedRules.length} rules into ${consolidated.length}`);
  return consolidated;
}

/** Union-Find to group rules that overlap above the threshold. */
function groupOverlappingRules(rules: ClassifiedRule[], threshold: number): ClassifiedRule[][] {
  const parent = new Map<number, number>();
  for (let i = 0; i < rules.length; i++) parent.set(i, i);

  function find(x: number): number {
    if (parent.get(x) !== x) parent.set(x, find(parent.get(x)!));
    return parent.get(x)!;
  }
  function union(a: number, b: number): void {
    parent.set(find(a), find(b));
  }

  for (let i = 0; i < rules.length; i++) {
    for (const overlap of rules[i]!.overlaps) {
      if (overlap.similarity >= threshold) {
        const j = rules.findIndex(r => r.fileName === overlap.ruleFile);
        if (j >= 0) union(i, j);
      }
    }
  }

  const groups = new Map<number, ClassifiedRule[]>();
  for (let i = 0; i < rules.length; i++) {
    const root = find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root)!.push(rules[i]!);
  }
  return [...groups.values()];
}

/**
 * Calculate universal score (0–100).
 * Based on unique source directories and file count within the group.
 */
export function calculateUniversalScore(group: ClassifiedRule[]): number {
  const uniqueDirs = new Set(group.map(r => r.sourceDir));
  const dirScore = Math.min(uniqueDirs.size * 30, 60);
  const fileScore = Math.min(group.length * 10, 40);
  return Math.min(dirScore + fileScore, 100);
}

async function mergeRuleGroup(group: ClassifiedRule[]): Promise<PipelineRule> {
  const severityOrder = ['CRITICAL', 'HIGH', 'MEDIUM'];
  const highestSeverity = group
    .map(r => r.severity)
    .sort((a, b) => severityOrder.indexOf(a) - severityOrder.indexOf(b))[0] ?? 'MEDIUM';

  const categoryCounts = new Map<string, number>();
  for (const rule of group) {
    categoryCounts.set(rule.category, (categoryCounts.get(rule.category) ?? 0) + 1);
  }
  const topCategory = [...categoryCounts.entries()].sort((a, b) => b[1] - a[1])[0]![0];

  const mergedContent = await queue.add(() => mergeContents(group));

  const allPatterns = new Set<string>();
  for (const rule of group) {
    for (const p of rule.keyPatterns) allPatterns.add(p.toLowerCase());
  }

  return {
    id: crypto.randomUUID(),
    category: topCategory,
    severity: highestSeverity,
    target: group[0]!.target,
    title: `${topCategory} — consolidated`,
    content: mergedContent,
    summary: `Consolidated from ${group.length} rules`,
    mergedFrom: group.map(r => r.fileName),
    universalScore: calculateUniversalScore(group),
    keyPatterns: [...allPatterns],
  };
}

async function mergeContents(group: ClassifiedRule[]): Promise<string> {
  const prompt = `Merge these ${group.length} overlapping AI coding rules into ONE consolidated rule. Keep the most important points from each. Return ONLY the merged rule content in markdown.\n\n${group.map((r, i) => `--- Rule ${i + 1}: ${r.fileName} ---\n${r.content.slice(0, 1000)}`).join('\n\n')}`;
  const result = await callClaude({ prompt, model: MODELS.SONNET });
  return result.content;
}

