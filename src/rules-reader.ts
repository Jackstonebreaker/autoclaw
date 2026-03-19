import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { createLogger } from './logger.js';
import type { RawRule } from './types.js';

// Re-export so existing consumers that import RawRule from rules-reader continue to work.
export type { RawRule } from './types.js';

const logger = createLogger('rules-reader');

/** Default rule directories searched when no custom paths are provided */
export const DEFAULT_RULE_DIRS = ['.claude/rules', '.augment/rules', '.cursor/rules'];

/**
 * Read all .md rule files recursively from configured directories.
 * @param cwd  Base directory to resolve rule dirs against (defaults to process.cwd())
 * @param customPaths  Override the default rule directories
 */
export function readRules(cwd: string = process.cwd(), customPaths?: string[]): RawRule[] {
  const dirs = customPaths ?? DEFAULT_RULE_DIRS;
  const rules: RawRule[] = [];

  for (const dir of dirs) {
    const fullPath = join(cwd, dir);

    if (!existsSync(fullPath)) {
      logger.info(`Rule dir not found, skipping: ${dir}`);
      continue;
    }

    try {
      const files = readDirRecursive(fullPath);
      for (const file of files) {
        if (!file.endsWith('.md')) continue;
        try {
          const content = readFileSync(file, 'utf-8');
          rules.push({
            filePath: file,
            content,
            sourceDir: dir,
            fileName: basename(file),
          });
        } catch (err) {
          logger.warn(`Failed to read rule file: ${file}`, err);
        }
      }
    } catch (err) {
      logger.warn(`Failed to read rule dir: ${dir}`, err);
    }
  }

  logger.info(`Read ${rules.length} rules from ${dirs.length} directories`);
  return rules;
}

/**
 * Recursively list all file paths under a directory.
 */
function readDirRecursive(dir: string): string[] {
  const results: string[] = [];
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...readDirRecursive(fullPath));
    } else {
      results.push(fullPath);
    }
  }
  return results;
}

