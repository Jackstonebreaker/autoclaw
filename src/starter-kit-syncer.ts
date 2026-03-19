import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { createLogger } from './logger.js';
import { readStarterKit } from './starter-kit.js';

const logger = createLogger('starter-kit-syncer');

export type RuleSyncStatus = 'up-to-date' | 'outdated' | 'missing' | 'custom';

export interface SyncRuleStatus {
  path: string;
  status: RuleSyncStatus;
  severity: string;
  category: string;
  localChecksum?: string;
  templateChecksum?: string;
}

export interface SyncCheckResult {
  rules: SyncRuleStatus[];
  hasOutdated: boolean;
  hasMissing: boolean;
  hasCriticalMissing: boolean;
  summary: { upToDate: number; outdated: number; missing: number; custom: number };
}

export interface SyncApplyResult {
  updated: string[];
  created: string[];
  preserved: string[];
  errors: string[];
  commitMessage: string;
}

/**
 * Check sync status between local rules and a starter kit template
 */
export function checkSync(
  kitPath: string,
  targetDir: string,
  customRules: string[] = []
): SyncCheckResult {
  logger.info(`Checking sync: ${kitPath} → ${targetDir}`);

  const kit = readStarterKit(kitPath);
  const rules: SyncRuleStatus[] = [];

  for (const { rule, content } of kit.rules) {
    const localPath = join(targetDir, rule.path);
    const templateChecksum = createHash('sha256').update(content).digest('hex');

    if (customRules.includes(rule.path)) {
      rules.push({ path: rule.path, status: 'custom', severity: rule.severity, category: rule.category, templateChecksum });
      continue;
    }

    if (!existsSync(localPath)) {
      rules.push({ path: rule.path, status: 'missing', severity: rule.severity, category: rule.category, templateChecksum });
      continue;
    }

    const localContent = readFileSync(localPath, 'utf-8');
    const localChecksum = createHash('sha256').update(localContent).digest('hex');

    if (localChecksum === templateChecksum) {
      rules.push({ path: rule.path, status: 'up-to-date', severity: rule.severity, category: rule.category, localChecksum, templateChecksum });
    } else {
      rules.push({ path: rule.path, status: 'outdated', severity: rule.severity, category: rule.category, localChecksum, templateChecksum });
    }
  }

  const summary = {
    upToDate: rules.filter(r => r.status === 'up-to-date').length,
    outdated: rules.filter(r => r.status === 'outdated').length,
    missing: rules.filter(r => r.status === 'missing').length,
    custom: rules.filter(r => r.status === 'custom').length,
  };

  const hasCriticalMissing = rules.some(r => r.status === 'missing' && r.severity.toUpperCase() === 'CRITICAL');

  return {
    rules,
    hasOutdated: summary.outdated > 0,
    hasMissing: summary.missing > 0,
    hasCriticalMissing,
    summary,
  };
}

/**
 * Apply sync — update outdated and create missing rules (preserve custom)
 */
export function applySync(
  kitPath: string,
  targetDir: string,
  customRules: string[] = [],
  options: { dryRun?: boolean } = {}
): SyncApplyResult {
  logger.info(`Applying sync: ${kitPath} → ${targetDir}`);

  const kit = readStarterKit(kitPath);
  const updated: string[] = [];
  const created: string[] = [];
  const preserved: string[] = [];
  const errors: string[] = [];

  for (const { rule, content } of kit.rules) {
    const localPath = join(targetDir, rule.path);

    if (customRules.includes(rule.path)) {
      preserved.push(rule.path);
      continue;
    }

    const templateHash = createHash('sha256').update(content).digest('hex');

    if (options.dryRun) {
      if (!existsSync(localPath)) {
        created.push(rule.path);
      } else {
        const localContent = readFileSync(localPath, 'utf-8');
        const localHash = createHash('sha256').update(localContent).digest('hex');
        if (localHash !== templateHash) updated.push(rule.path);
      }
      continue;
    }

    try {
      mkdirSync(dirname(localPath), { recursive: true });
      if (!existsSync(localPath)) {
        writeFileSync(localPath, content, 'utf-8');
        created.push(rule.path);
      } else {
        const localContent = readFileSync(localPath, 'utf-8');
        const localHash = createHash('sha256').update(localContent).digest('hex');
        if (localHash !== templateHash) {
          writeFileSync(localPath, content, 'utf-8');
          updated.push(rule.path);
        }
      }
    } catch (err) {
      errors.push(`${rule.path}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const commitMessage = `chore: sync rules from autoclaw template v${kit.manifest.version}`;
  return { updated, created, preserved, errors, commitMessage };
}

