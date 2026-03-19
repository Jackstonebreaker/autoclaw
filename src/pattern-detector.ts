import type { StorageAdapter } from './storage/adapter.js';
import type { SessionPattern, PatternDetectionResult, LearnedPattern } from './types.js';
import { createLogger } from './logger.js';

const logger = createLogger('pattern-detector');

/**
 * Calculate Jaccard similarity between two sets of strings
 */
export function jaccardSimilarity(a: string[], b: string[]): number {
  const setA = new Set(a);
  const setB = new Set(b);
  const intersection = new Set([...setA].filter(x => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  return union.size === 0 ? 0 : intersection.size / union.size;
}

/**
 * Group patterns by semantic similarity (same category + similar description)
 */
export function groupPatternsSemantically(patterns: SessionPattern[]): Map<string, SessionPattern[]> {
  const groups = new Map<string, SessionPattern[]>();

  for (const pattern of patterns) {
    const key = pattern.category;
    const existing = groups.get(key) ?? [];
    existing.push(pattern);
    groups.set(key, existing);
  }

  return groups;
}

/**
 * Detect cross-session patterns using Jaccard similarity
 */
export async function detectCrossSessionPatterns(
  storage: StorageAdapter,
  currentPatterns: SessionPattern[],
  sessionId: string
): Promise<PatternDetectionResult> {
  logger.info(`Detecting cross-session patterns for ${currentPatterns.length} patterns`);

  const existingPatterns: LearnedPattern[] = await storage.getPatterns();
  const newPatterns: SessionPattern[] = [];
  const recurringPatterns: SessionPattern[] = [];
  const crossSessionMatches: PatternDetectionResult['crossSessionMatches'] = [];

  for (const current of currentPatterns) {
    const currentWords = current.description.toLowerCase().split(/\s+/);
    let bestMatch: LearnedPattern | null = null;
    let bestSimilarity = 0;

    for (const existing of existingPatterns) {
      if (existing.category !== current.category) continue;

      const existingWords = existing.description.toLowerCase().split(/\s+/);
      const similarity = jaccardSimilarity(currentWords, existingWords);

      if (similarity > bestSimilarity) {
        bestSimilarity = similarity;
        bestMatch = existing;
      }
    }

    if (bestMatch && bestSimilarity >= 0.5) {
      // Recurring pattern — update existing
      recurringPatterns.push(current);

      await storage.updatePattern(bestMatch.id, {
        frequency: bestMatch.frequency + current.frequency,
        lastSeen: current.lastSeen,
        confidence: Math.max(bestMatch.confidence, current.confidence),
        sessionIds: [...bestMatch.sessionIds, sessionId],
      });

      crossSessionMatches.push({
        pattern: current,
        matchedSessionIds: bestMatch.sessionIds,
        jaccardSimilarity: bestSimilarity,
      });
    } else {
      // New pattern
      newPatterns.push(current);

      await storage.savePattern({
        id: crypto.randomUUID(),
        description: current.description,
        category: current.category,
        frequency: current.frequency,
        confidence: current.confidence,
        examples: current.examples,
        firstSeen: current.firstSeen,
        lastSeen: current.lastSeen,
        sessionIds: [sessionId],
      });
    }
  }

  logger.info(
    `Results: ${newPatterns.length} new, ${recurringPatterns.length} recurring, ${crossSessionMatches.length} cross-session`
  );

  return { newPatterns, recurringPatterns, crossSessionMatches };
}

