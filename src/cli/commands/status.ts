import { Command } from 'commander';
import { loadConfig } from '../../config.js';
import { createStorage } from '../../storage/index.js';
import { createLogger } from '../../logger.js';
import { checkDocSync } from '../../doc-syncer.js';

const logger = createLogger('cli:status');

export function registerStatusCommand(program: Command): void {
  program
    .command('status')
    .description('Display a dashboard of AutoClaw state')
    .option('--storage <type>', 'Storage backend (sqlite|file|supabase)', undefined)
    .action(async (options: { storage?: string }) => {
      const config = loadConfig();
      if (options.storage) {
        (config as Record<string, unknown>).storage = options.storage;
      }
      const storage = createStorage(config);
      await storage.initialize();
      try {
        logger.info('Gathering status information...');

        // Fetch counts in parallel
        const [sessions, patterns, allRules, alerts, docSync] = await Promise.all([
          storage.getSessions({ limit: 100 }),
          storage.getPatterns(),
          storage.getRules(),
          storage.getAlerts({ acknowledged: false }),
          checkDocSync(storage),
        ]);

        const pendingRules = allRules.filter(r => r.status === 'PENDING');
        const approvedRules = allRules.filter(r => r.status === 'APPROVED');
        const appliedRules = allRules.filter(r => r.status === 'APPLIED');

        // Count patterns by category
        const byCategory: Record<string, number> = {};
        for (const p of patterns) {
          byCategory[p.category] = (byCategory[p.category] ?? 0) + 1;
        }

        console.log('\n📋 AutoClaw Status Dashboard');
        console.log('═'.repeat(40));

        console.log('\n📁 Sessions');
        console.log(`  Analyzed : ${sessions.length}`);
        if (sessions.length > 0) {
          const latest = sessions[0];
          if (latest) {
            console.log(`  Latest   : ${new Date(latest.analyzedAt).toLocaleString()}`);
          }
        }

        console.log('\n🔍 Patterns');
        console.log(`  Total    : ${patterns.length}`);
        for (const [cat, count] of Object.entries(byCategory).sort((a, b) => b[1] - a[1]).slice(0, 5)) {
          console.log(`  ${cat.padEnd(20)} ${count}`);
        }

        console.log('\n📌 Rules');
        console.log(`  PENDING  : ${pendingRules.length}`);
        console.log(`  APPROVED : ${approvedRules.length}`);
        console.log(`  APPLIED  : ${appliedRules.length}`);

        console.log('\n🔔 Alerts (unacknowledged)');
        console.log(`  Total    : ${alerts.length}`);
        if (alerts.length > 0) {
          for (const a of alerts.slice(0, 3)) {
            console.log(`  [${a.severity}] ${a.message}`);
          }
        }

        console.log('\n📄 Doc Sync');
        const syncStatus = docSync.missingFromDocs.length === 0 && !docSync.agentsMdStale ? '✓ OK' : '⚠  Issues';
        console.log(`  Status   : ${syncStatus}`);
        if (docSync.missingFromDocs.length > 0) {
          console.log(`  Missing  : ${docSync.missingFromDocs.length} rules not referenced in docs`);
        }
        if (docSync.agentsMdStale) {
          console.log(`  Warning  : AGENTS.md is stale (>7 days)`);
        }

        console.log('');
      } finally {
        await storage.close();
      }
    });
}

