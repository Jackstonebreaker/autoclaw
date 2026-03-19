import { Command } from 'commander';
import { loadConfig } from '../../config.js';
import { createStorage } from '../../storage/index.js';
import { createLogger } from '../../logger.js';
import { analyzeSession } from '../../session-analyzer.js';
import { generateRuleSuggestions } from '../../rule-suggester.js';

const logger = createLogger('cli:suggest');

export function registerSuggestCommand(program: Command): void {
  program
    .command('suggest')
    .description('Generate rule suggestions from detected patterns')
    .option('--dry-run', 'Simulate without saving suggestions', false)
    .option('--storage <type>', 'Storage backend (sqlite|file|supabase)', undefined)
    .option('--since <period>', 'Time period for analysis', '7 days ago')
    .option('--threshold <number>', 'Confidence threshold (0-1)', '0.7')
    .action(async (options: { dryRun: boolean; storage?: string; since: string; threshold: string }) => {
      const config = loadConfig();
      if (options.storage) {
        (config as Record<string, unknown>).storage = options.storage;
      }
      const storage = createStorage(config);
      await storage.initialize();
      try {
        logger.info('Analyzing session and generating rule suggestions...');
        const analysis = await analyzeSession(storage, {
          since: options.since,
          dryRun: options.dryRun,
        });

        const threshold = parseFloat(options.threshold);
        const suggestions = await generateRuleSuggestions(storage, {
          patterns: analysis.patterns,
          confidenceThreshold: isNaN(threshold) ? config.suggestionThreshold : threshold,
          dryRun: options.dryRun,
        });

        console.log('\n💡 Rule Suggestions');
        console.log('─'.repeat(40));
        console.log(`Suggestions generated : ${suggestions.length}`);

        if (suggestions.length > 0) {
          console.log('\nSuggestions:');
          for (const s of suggestions) {
            const conf = (s.confidence * 100).toFixed(0);
            console.log(`\n  📌 ${s.title}`);
            console.log(`     Category : ${s.category} | Severity: ${s.severity}`);
            console.log(`     Status   : ${s.status} | Confidence: ${conf}%`);
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

