import { Command } from 'commander';
import { loadConfig } from '../../config.js';
import { createStorage } from '../../storage/index.js';
import { createLogger } from '../../logger.js';
import { analyzeSession } from '../../session-analyzer.js';
import { detectCrossSessionPatterns } from '../../pattern-detector.js';

const logger = createLogger('cli:detect');

export function registerDetectCommand(program: Command): void {
  program
    .command('detect')
    .description('Detect cross-session patterns from recent git history')
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
        logger.info('Analyzing session and detecting cross-session patterns...');
        const analysis = await analyzeSession(storage, {
          since: options.since,
          dryRun: options.dryRun,
        });

        const detection = await detectCrossSessionPatterns(
          storage,
          analysis.patterns,
          analysis.sessionId
        );

        console.log('\n🔍 Cross-Session Pattern Detection');
        console.log('─'.repeat(40));
        console.log(`New patterns       : ${detection.newPatterns.length}`);
        console.log(`Recurring patterns : ${detection.recurringPatterns.length}`);
        console.log(`Cross-session hits : ${detection.crossSessionMatches.length}`);

        if (detection.crossSessionMatches.length > 0) {
          console.log('\nCross-session matches:');
          for (const match of detection.crossSessionMatches) {
            const sim = (match.jaccardSimilarity * 100).toFixed(0);
            console.log(`  [${match.pattern.category}] ${match.pattern.description}`);
            console.log(`    Sessions: ${match.matchedSessionIds.length} | Similarity: ${sim}%`);
          }
        }

        if (detection.recurringPatterns.length > 0) {
          console.log('\nRecurring patterns:');
          for (const p of detection.recurringPatterns.slice(0, 5)) {
            console.log(`  [${p.category}] ${p.description} (×${p.frequency})`);
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

