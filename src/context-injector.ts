import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createLogger } from './logger.js';
import type { StorageAdapter } from './storage/adapter.js';

const logger = createLogger('context-injector');

const CONTEXT_FILE = 'session-context.md';
const MIN_CONFIDENCE = 0.6;

/**
 * Build session context from high-confidence patterns.
 * Writes a markdown file that AI agents can read for context.
 */
export async function buildSessionContext(
  storage: StorageAdapter,
  cwd: string = process.cwd()
): Promise<{ patternsInjected: number; filePath: string }> {
  logger.info('Building session context');

  const patterns = await storage.getPatterns({ minConfidence: MIN_CONFIDENCE });

  if (patterns.length === 0) {
    logger.info('No patterns above confidence threshold for context injection');
    return { patternsInjected: 0, filePath: '' };
  }

  // Sort by confidence descending
  const sorted = [...patterns].sort((a, b) => b.confidence - a.confidence);

  const lines: string[] = [
    '# Session Context — AutoClaw',
    '',
    `> Auto-generated on ${new Date().toISOString()}`,
    `> ${sorted.length} patterns with confidence ≥ ${MIN_CONFIDENCE}`,
    '',
    '## Known Patterns',
    '',
  ];

  for (const pattern of sorted) {
    lines.push(`### ${pattern.category} (confidence: ${(pattern.confidence * 100).toFixed(0)}%)`);
    lines.push('');
    lines.push(pattern.description);
    lines.push('');
    if (pattern.examples.length > 0) {
      lines.push('**Examples:**');
      for (const ex of pattern.examples.slice(0, 3)) {
        lines.push(`- ${ex}`);
      }
      lines.push('');
    }
  }

  const filePath = join(cwd, CONTEXT_FILE);
  writeFileSync(filePath, lines.join('\n'), 'utf-8');

  logger.info(`Injected ${sorted.length} patterns into ${CONTEXT_FILE}`);
  return { patternsInjected: sorted.length, filePath };
}

