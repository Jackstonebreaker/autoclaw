import { Command } from 'commander';
import { loadConfig } from '../../config.js';
import { createStorage } from '../../storage/index.js';
import { createLogger } from '../../logger.js';
import { runPipeline } from '../../orchestrator.js';

const logger = createLogger('cli:run');

export function registerRunCommand(program: Command): void {
  program
    .command('run')
    .description('Run the full 11-step AutoClaw pipeline')
    .option('--dry-run', 'Simulate without making changes', false)
    .option('--storage <type>', 'Storage backend (sqlite|file|supabase)', undefined)
    .option('--since <period>', 'Time period for analysis', '7 days ago')
    .action(async (options: { dryRun: boolean; storage?: string; since: string }) => {
      const config = loadConfig();
      if (options.storage) {
        (config as Record<string, unknown>).storage = options.storage;
      }
      const storage = createStorage(config);
      await storage.initialize();
      try {
        logger.info('Starting full AutoClaw pipeline...');
        const result = await runPipeline(storage, config, {
          since: options.since,
          dryRun: options.dryRun,
        });

        console.log('\n🚀 Pipeline Result');
        console.log('─'.repeat(40));
        console.log(`Session ID     : ${result.sessionId}`);
        console.log(`Total duration : ${result.totalDuration}ms`);
        console.log('\nStep results:');

        for (const [step, info] of Object.entries(result.steps)) {
          const icon = info.status === 'ok' ? '✓' : info.status === 'skipped' ? '⏭' : '✗';
          const detail = info.detail ? ` — ${info.detail}` : '';
          console.log(`  ${icon} ${step.padEnd(30)} ${info.duration}ms${detail}`);
        }

        const failed = Object.values(result.steps).filter(s => s.status === 'error').length;
        const skipped = Object.values(result.steps).filter(s => s.status === 'skipped').length;
        const ok = Object.values(result.steps).filter(s => s.status === 'ok').length;

        console.log(`\n  ✓ ${ok} ok  ⏭ ${skipped} skipped  ✗ ${failed} failed`);

        if (options.dryRun) {
          console.log('\n⚠️  Dry-run mode — no data saved');
        }
      } finally {
        await storage.close();
      }
    });
}

