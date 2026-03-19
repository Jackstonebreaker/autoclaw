import { Command } from 'commander';
import { loadConfig } from '../../config.js';
import { createStorage } from '../../storage/index.js';
import { createLogger } from '../../logger.js';
import { analyzeSession } from '../../session-analyzer.js';

const logger = createLogger('cli:analyze');

export function registerAnalyzeCommand(program: Command): void {
  program
    .command('analyze')
    .description('Analyze git session and extract coding patterns')
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
        logger.info('Starting session analysis...');
        const analysis = await analyzeSession(storage, {
          since: options.since,
          dryRun: options.dryRun,
        });

        console.log('\n📊 Session Analysis');
        console.log('─'.repeat(40));
        console.log(`Session ID : ${analysis.sessionId}`);
        console.log(`Commits    : ${analysis.commitCount}`);
        console.log(`Files      : ${analysis.filesChanged}`);
        console.log(`Patterns   : ${analysis.patterns.length}`);
        console.log(`Error rate : ${(analysis.quality.errorRate * 100).toFixed(1)}%`);
        if (analysis.patterns.length > 0) {
          console.log('\nTop patterns:');
          for (const p of analysis.patterns.slice(0, 5)) {
            console.log(`  [${p.category}] ${p.description} (conf: ${(p.confidence * 100).toFixed(0)}%)`);
          }
        }
        if (options.dryRun) {
          console.log('\n⚠️  Dry-run mode — no data saved');
        }
      } finally {
        await storage.close();
      }
    });
}

