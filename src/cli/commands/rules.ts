import type { Command } from 'commander';
import { loadConfig } from '../../config.js';
import { createStorage } from '../../storage/index.js';
import { createLogger } from '../../logger.js';
import { auditRules } from '../../rules-auditor.js';
import { generateUniversalRules } from '../../rules-generator.js';
import type { AutoClawConfig, ConsolidatedRule as StorageConsolidatedRule } from '../../types.js';
import type { ConsolidatedRule } from '../../rules-consolidator.js';

const logger = createLogger('cli:rules');

/** Reverse-map storage severity (CRITICAL/MAJOR/MINOR) to consolidator severity */
function toConsolidatorSeverity(s: string): string {
  if (s === 'MAJOR') return 'HIGH';
  if (s === 'MINOR') return 'MEDIUM';
  return s; // CRITICAL stays CRITICAL
}

/** Reverse-map storage targetIDE to consolidator target */
function toConsolidatorTarget(t: string): string {
  if (t === 'claude') return 'agents-only';
  if (t === 'cursor') return 'nextjs-only';
  return 'universal';
}

/** Map storage ConsolidatedRule to consolidator ConsolidatedRule for generateUniversalRules */
function toConsolidatorRule(r: StorageConsolidatedRule): ConsolidatedRule {
  return {
    id: r.id,
    category: r.classification.category.toLowerCase(),
    severity: toConsolidatorSeverity(r.classification.severity),
    target: toConsolidatorTarget(r.classification.targetIDE),
    title: r.title,
    content: r.content,
    summary: '',
    mergedFrom: r.sourceRules,
    universalScore: Math.round(r.universalScore * 100),
    keyPatterns: [],
  };
}

export function registerRulesCommand(program: Command): void {
  const rulesCmd = program
    .command('rules')
    .description('Manage and audit AI coding rules');

  // autoclaw rules audit
  rulesCmd
    .command('audit')
    .description('Read, classify, consolidate and generate universal rules')
    .option('--dry-run', 'Preview without writing files', false)
    .option('--output <dir>', 'Output directory for generated rules', './rules/universal')
    .option('--storage <type>', 'Storage backend', 'file')
    .option('--path <dir>', 'Path to repo to audit', '.')
    .action(async (opts: { dryRun: boolean; output: string; storage: string; path: string }) => {
      const cwd = opts.path === '.' ? process.cwd() : opts.path;
      const config = loadConfig(cwd);
      const storage = createStorage({ ...config, storage: opts.storage as AutoClawConfig['storage'] });
      await storage.initialize();

      try {
        const result = await auditRules(storage, {
          cwd,
          outputDir: opts.output,
          dryRun: opts.dryRun,
        });

        console.log('\n📊 Rules Audit Report');
        console.log('═'.repeat(40));
        console.log(`  Rules scanned:    ${result.totalRulesScanned}`);
        console.log(`  Classified:       ${result.classified}`);
        console.log(`  Consolidated:     ${result.consolidated}`);
        console.log(`  Overlaps found:   ${result.overlapsDetected}`);
        console.log(`  Files generated:  ${result.generated}`);
        console.log(`  Coverage:         ${result.coveragePercent}%`);
        console.log('\n  Categories:');
        for (const [cat, count] of Object.entries(result.categories)) {
          console.log(`    ${cat}: ${count}`);
        }
        console.log('\n  Severities:');
        for (const [sev, count] of Object.entries(result.severities)) {
          console.log(`    ${sev}: ${count}`);
        }
        if (opts.dryRun) console.log('\n  ⚠️  Dry-run mode — no files written');

        // Exit code: 1 if consolidation coverage < 80%
        if (result.coveragePercent < 80) {
          logger.warn(`Coverage ${result.coveragePercent}% is below 80% threshold`);
          process.exitCode = 1;
        }
      } finally {
        await storage.close();
      }
    });

  // autoclaw rules generate
  rulesCmd
    .command('generate')
    .description('Generate universal rules from already-classified rules in storage')
    .option('--output <dir>', 'Output directory', './rules/universal')
    .option('--storage <type>', 'Storage backend', 'file')
    .option('--sources <paths>', 'Comma-separated source paths to read rules from directly')
    .action(async (opts: { output: string; storage: string; sources?: string }) => {
      const config = loadConfig(process.cwd());
      const storage = createStorage({ ...config, storage: opts.storage as AutoClawConfig['storage'] });
      await storage.initialize();

      try {
        if (opts.sources) {
          // Run full pipeline from custom source paths
          const customPaths = opts.sources.split(',').map((p: string) => p.trim()).filter(Boolean);
          const result = await auditRules(storage, {
            cwd: process.cwd(),
            outputDir: opts.output,
            customPaths,
          });
          console.log(`\n✅ Generated ${result.generated} files from custom sources`);
          return;
        }

        const storageRules = await storage.getConsolidatedRules();
        if (storageRules.length === 0) {
          console.log('No consolidated rules found. Run `autoclaw rules audit` first.');
          logger.info('No consolidated rules in storage');
          return;
        }

        const rules = storageRules.map(toConsolidatorRule);
        const result = await generateUniversalRules(rules, storage, opts.output);
        console.log(`\n✅ Generated ${result.filesWritten} files (${result.filesSkipped} unchanged)`);
      } finally {
        await storage.close();
      }
    });
}

