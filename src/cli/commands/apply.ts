import { Command } from 'commander';
import { loadConfig } from '../../config.js';
import { createStorage } from '../../storage/index.js';
import { createLogger } from '../../logger.js';
import { autoApproveHighConfidenceRules, applyAllPendingRules } from '../../rule-applier.js';

const logger = createLogger('cli:apply');

export function registerApplyCommand(program: Command): void {
  program
    .command('apply')
    .description('Auto-approve high-confidence rules and apply all pending rules to disk')
    .option('--dry-run', 'Simulate without writing files', false)
    .option('--storage <type>', 'Storage backend (sqlite|file|supabase)', undefined)
    .action(async (options: { dryRun: boolean; storage?: string }) => {
      const config = loadConfig();
      if (options.storage) {
        (config as Record<string, unknown>).storage = options.storage;
      }
      const storage = createStorage(config);
      await storage.initialize();
      try {
        logger.info('Auto-approving high-confidence rules...');
        const approved = await autoApproveHighConfidenceRules(storage, config);

        console.log('\n✅ Rule Application');
        console.log('─'.repeat(40));
        console.log(`Auto-approved : ${approved.length} rules`);

        if (approved.length > 0) {
          for (const r of approved) {
            const conf = (r.confidence * 100).toFixed(0);
            console.log(`  ✓ ${r.title} (${conf}% confidence)`);
          }
        }

        if (!options.dryRun) {
          logger.info('Applying all approved rules...');
          const result = await applyAllPendingRules(storage, config);
          console.log(`Applied       : ${result.applied} rules`);
          console.log(`Skipped       : ${result.skipped} rules`);
          if (result.applied > 0) {
            console.log(`\nRules written to: ${config.targetDirs.join(', ')}`);
          }
        } else {
          console.log('\n⚠️  Dry-run mode — rules not written to disk');
        }
      } finally {
        await storage.close();
      }
    });
}

