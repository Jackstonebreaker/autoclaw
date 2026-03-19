import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createLogger } from './logger.js';
import type { StorageAdapter } from './storage/adapter.js';

const logger = createLogger('doc-syncer');

export interface DocSyncResult {
  missingFromDocs: string[];   // Rules APPLIED but not mentioned in docs
  staleDocFiles: string[];     // Doc files not modified in > 7 days
  agentsMdStale: boolean;      // AGENTS.md specifically is stale
}

const DOC_FILES = ['AGENTS.md', 'CLAUDE.md'];
const STALE_THRESHOLD_DAYS = 7;

/**
 * Extract rule references from a doc file.
 * Looks for patterns like `.claude/rules/xxx.md` or `.augment/rules/xxx.md`
 */
export function extractRuleReferences(content: string): string[] {
  const regex = /\.(claude|augment|cursor)\/rules\/[\w-]+\.md/g;
  const matches = content.match(regex) ?? [];
  return [...new Set(matches)];
}

/**
 * Check if a file is stale (not modified in > threshold days)
 */
export function isFileStale(filePath: string, thresholdDays: number = STALE_THRESHOLD_DAYS): boolean {
  try {
    const stat = statSync(filePath);
    const daysSinceModified = (Date.now() - stat.mtimeMs) / (1000 * 60 * 60 * 24);
    return daysSinceModified > thresholdDays;
  } catch {
    return false; // File doesn't exist — not stale, just missing
  }
}

/**
 * Check doc synchronization — READ-ONLY, never modifies files
 */
export async function checkDocSync(
  storage: StorageAdapter,
  cwd: string = process.cwd()
): Promise<DocSyncResult> {
  logger.info('Checking doc synchronization');

  const result: DocSyncResult = {
    missingFromDocs: [],
    staleDocFiles: [],
    agentsMdStale: false,
  };

  // Get all APPLIED rules
  const appliedRules = await storage.getRules({ status: 'APPLIED' });
  const appliedTitles = appliedRules.map(
    r => r.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '.md'
  );

  // Collect all rule references from docs
  const allDocRefs: string[] = [];

  for (const docFile of DOC_FILES) {
    const filePath = join(cwd, docFile);

    try {
      const content = readFileSync(filePath, 'utf-8');
      const refs = extractRuleReferences(content);
      allDocRefs.push(...refs);
    } catch {
      // File doesn't exist — that's OK, non-blocking
      logger.info(`${docFile} not found — skipping`);
    }

    // Check staleness
    if (isFileStale(filePath)) {
      result.staleDocFiles.push(docFile);
      if (docFile === 'AGENTS.md') {
        result.agentsMdStale = true;
      }
    }
  }

  // Find APPLIED rules not mentioned in any doc
  for (const ruleFileName of appliedTitles) {
    const isReferenced = allDocRefs.some(ref => ref.endsWith(ruleFileName));
    if (!isReferenced) {
      result.missingFromDocs.push(ruleFileName);
    }
  }

  if (result.missingFromDocs.length > 0) {
    logger.warn(`${result.missingFromDocs.length} applied rules missing from docs`);
  }
  if (result.staleDocFiles.length > 0) {
    logger.warn(`${result.staleDocFiles.length} doc files are stale (>${STALE_THRESHOLD_DAYS} days)`);
  }

  return result;
}

