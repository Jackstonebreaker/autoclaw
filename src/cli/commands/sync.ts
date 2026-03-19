import type { Command } from 'commander';
import { createLogger } from '../../logger.js';
import { checkSync, applySync } from '../../starter-kit-syncer.js';

const logger = createLogger('cli:sync');

export function registerSyncCommand(program: Command): void {
  program
    .command('sync')
    .description('Sync local rules with starter kit template')
    .requiredOption('--kit <path>', 'Path to the starter kit template')
    .option('--check', 'Check sync status without applying', false)
    .option('--apply', 'Apply sync updates', false)
    .option('--dry-run', 'Preview changes without applying', false)
    .option('--storage <type>', 'Storage backend (supabase|sqlite|file)', undefined)
    .option('--custom-rules <rules...>', 'Custom rules to preserve (space-separated paths)')
    .action(async (opts: { kit: string; check: boolean; apply: boolean; dryRun: boolean; storage?: string; customRules?: string[] }) => {
      const customRules = opts.customRules ?? [];
      const cwd = process.cwd();

      if (opts.check || (!opts.check && !opts.apply)) {
        const result = checkSync(opts.kit, cwd, customRules);

        console.log('\n🔍 Sync Check Report');
        console.log('═'.repeat(40));
        console.log(`  Up-to-date: ${result.summary.upToDate}`);
        console.log(`  Outdated:   ${result.summary.outdated}`);
        console.log(`  Missing:    ${result.summary.missing}`);
        console.log(`  Custom:     ${result.summary.custom}`);

        if (result.rules.length > 0) {
          console.log('\n  Details:');
          for (const rule of result.rules) {
            const icon = { 'up-to-date': '✅', outdated: '🔄', missing: '❌', custom: '🔒' }[rule.status];
            console.log(`    ${icon} [${rule.severity}] ${rule.path} — ${rule.status}`);
          }
        }

        if (result.hasCriticalMissing) {
          console.log('\n  ⚠️  CRITICAL rules are missing! Run `autoclaw sync --apply` to fix.');
          process.exitCode = 1;
        }
        return;
      }

      if (opts.apply) {
        const result = applySync(opts.kit, cwd, customRules, { dryRun: opts.dryRun });

        console.log('\n🔄 Sync Apply Report');
        console.log('═'.repeat(40));
        console.log(`  Updated:    ${result.updated.length}`);
        console.log(`  Created:    ${result.created.length}`);
        console.log(`  Preserved:  ${result.preserved.length}`);
        console.log(`  Errors:     ${result.errors.length}`);

        if (result.updated.length > 0 || result.created.length > 0) {
          console.log(`\n  Suggested commit: ${result.commitMessage}`);
        }

        if (opts.dryRun) {
          console.log('\n  ⚠️  Dry-run mode — no files written');
        }
      }

      logger.debug('sync command completed');
    });
}

