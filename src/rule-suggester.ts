import { callClaude, MODELS, SimpleQueue } from './ai/index.js';
import { createLogger } from './logger.js';
import { DEFAULT_RULE_DIRS } from './rules-reader.js';
import type { StorageAdapter } from './storage/adapter.js';
import type { SessionPattern, RuleSuggestion } from './types.js';
import { RuleSuggestionSchema } from './types.js';

const logger = createLogger('rule-suggester');
const queue = new SimpleQueue();

export interface SuggestRulesOptions {
  patterns: SessionPattern[];
  confidenceThreshold?: number; // default 0.70
  dryRun?: boolean;
}

/**
 * Generate rule suggestions from detected patterns using Claude Sonnet
 */
export async function generateRuleSuggestions(
  storage: StorageAdapter,
  options: SuggestRulesOptions
): Promise<RuleSuggestion[]> {
  const threshold = options.confidenceThreshold ?? 0.70;

  // Filter patterns above confidence threshold
  const eligiblePatterns = options.patterns.filter(p => p.confidence >= threshold);

  if (eligiblePatterns.length === 0) {
    logger.info('No patterns above confidence threshold');
    return [];
  }

  logger.info(`Generating suggestions for ${eligiblePatterns.length} patterns (threshold: ${threshold})`);

  // Check for existing rules to avoid duplicates
  const existingRules = await storage.getRules();

  const prompt = `Based on these coding patterns, generate AI coding rules that would prevent these issues.

PATTERNS:
${JSON.stringify(eligiblePatterns, null, 2)}

EXISTING RULES (avoid duplicates):
${existingRules.map(r => r.title).join('\n')}

For each pattern, generate a rule with:
- title: short descriptive title
- content: the full rule text (markdown, actionable, specific)
- category: same as the pattern category
- severity: CRITICAL if confidence > 0.9, MAJOR if > 0.7, MINOR otherwise
- confidence: same as pattern confidence

Return a JSON array of rules. Return ONLY the JSON array, no markdown.`;

  const result = await queue.add(() =>
    callClaude({
      prompt,
      model: MODELS.SONNET,
      systemPrompt: 'You are an expert at writing AI coding rules. Return only valid JSON.',
      temperature: 0,
    })
  );

  try {
    const parsed: unknown = JSON.parse(result.content);
    if (!Array.isArray(parsed)) return [];

    const now = new Date().toISOString();
    const suggestions: RuleSuggestion[] = (parsed as Record<string, unknown>[]).map((raw) => {
      return RuleSuggestionSchema.parse({
        id: crypto.randomUUID(),
        title: raw['title'] ?? 'Untitled Rule',
        content: raw['content'] ?? '',
        category: raw['category'] ?? 'OTHER',
        severity: raw['severity'] ?? 'MINOR',
        confidence: typeof raw['confidence'] === 'number' ? raw['confidence'] : 0.5,
        status: 'PENDING',
        sourcePatterns: eligiblePatterns.map(p => p.description),
        targetFiles: DEFAULT_RULE_DIRS,
        createdAt: now,
      });
    });

    // Save to storage
    if (!options.dryRun) {
      for (const suggestion of suggestions) {
        await storage.saveRule(suggestion);
      }
    }

    logger.info(`Generated ${suggestions.length} rule suggestions`);
    return suggestions;
  } catch {
    logger.warn('Failed to parse Claude response for rule suggestions');
    return [];
  }
}

