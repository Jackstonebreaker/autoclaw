import { Command } from 'commander';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { createLogger } from '../../logger.js';
import { AutoClawConfigSchema } from '../../types.js';
import { loadConfig } from '../../config.js';
import { createStorage } from '../../storage/index.js';
import { distributeStarterKit } from '../../starter-kit-distributor.js';

const logger = createLogger('cli:init');

const DEFAULT_DIRS = ['.claude/rules', '.augment/rules', '.cursor/rules'];

export function registerInitCommand(program: Command): void {
  program
    .command('init')
    .description('Initialize AutoClaw in the current project')
    .option('--cwd <path>', 'Working directory', process.cwd())
    .option('--from-starter-kit <path>', 'Apply a starter kit from a local directory')
    .option('--dry-run', 'Simulate without making changes', false)
    .option('--storage <type>', 'Storage backend (supabase|sqlite|file)', undefined)
    .option('--project-name <name>', 'Override project name for starter kit distribution')
    .option('--overwrite', 'Overwrite existing files when applying starter kit', false)
    .action(async (options: { cwd: string; fromStarterKit?: string; dryRun: boolean; storage?: string; projectName?: string; overwrite: boolean }) => {
      const cwd = options.cwd;

      // If --from-starter-kit is provided, delegate to distributor and exit
      if (options.fromStarterKit) {
        await runFromStarterKit(options.fromStarterKit, cwd, {
          dryRun: options.dryRun,
          projectName: options.projectName,
          overwrite: options.overwrite,
        });
        return;
      }

      console.log('\n🐾 AutoClaw Init');
      console.log('─'.repeat(40));

      // 1. Create .autoclaw/config.json with defaults
      const configDir = join(cwd, '.autoclaw');
      const configPath = join(configDir, 'config.json');

      if (existsSync(configPath)) {
        console.log('⚠️  .autoclaw/config.json already exists — skipping');
      } else {
        mkdirSync(configDir, { recursive: true });
        const defaults = AutoClawConfigSchema.parse({});
        writeFileSync(configPath, JSON.stringify(defaults, null, 2), 'utf-8');
        console.log('✓  Created .autoclaw/config.json');
        logger.info('Created .autoclaw/config.json');
      }

      // 2. Create rule directories
      for (const dir of DEFAULT_DIRS) {
        const fullDir = join(cwd, dir);
        if (!existsSync(fullDir)) {
          mkdirSync(fullDir, { recursive: true });
          console.log(`✓  Created ${dir}/`);
          logger.info(`Created directory: ${dir}`);
        } else {
          console.log(`⏭  ${dir}/ already exists`);
        }
      }

      // 3. Attempt Husky post-commit hook installation
      console.log('\n🔗 Husky post-commit hook');
      try {
        // Check if husky is available
        execSync('npx husky --version', { cwd, stdio: 'pipe' });

        const hooksDir = join(cwd, '.husky');
        mkdirSync(hooksDir, { recursive: true });

        const hookPath = join(hooksDir, 'post-commit');
        const hookContent = '#!/bin/sh\nnpx autoclaw run --dry-run\n';

        if (!existsSync(hookPath)) {
          writeFileSync(hookPath, hookContent, { mode: 0o755 });
          console.log('✓  Installed post-commit hook (.husky/post-commit)');
          logger.info('Installed Husky post-commit hook');
        } else {
          console.log('⏭  .husky/post-commit already exists — skipping');
        }
      } catch {
        console.log('ℹ️  Husky not found — skipping hook installation');
        console.log('   To add manually: npx husky init && echo "npx autoclaw run --dry-run" > .husky/post-commit');
        logger.info('Husky not available — hook installation skipped');
      }

      console.log('\n✅ AutoClaw initialized successfully!');
      console.log('   Run `autoclaw run` to start the pipeline.\n');
    });
}

async function runFromStarterKit(
  kitPath: string,
  cwd: string,
  options: { dryRun: boolean; projectName?: string; overwrite: boolean }
): Promise<void> {
  console.log('\n🐾 AutoClaw Init — From Starter Kit');
  console.log('─'.repeat(40));
  console.log(`  Kit   : ${kitPath}`);
  console.log(`  Target: ${cwd}`);
  if (options.dryRun) console.log('  Mode  : dry-run');
  console.log('');

  const config = loadConfig(cwd);
  const storage = createStorage(config);
  await storage.initialize();

  try {
    const result = await distributeStarterKit(kitPath, cwd, storage, {
      projectName: options.projectName,
      overwrite: options.overwrite,
      dryRun: options.dryRun,
    });

    // Applied files
    if (result.applied.length > 0) {
      console.log(`✓  Applied ${result.applied.length} file(s):`);
      for (const f of result.applied) console.log(`     + ${f}`);
    }

    // Skipped files
    if (result.skipped.length > 0) {
      console.log(`⏭  Skipped ${result.skipped.length} existing file(s):`);
      for (const f of result.skipped) console.log(`     ~ ${f}`);
    }

    // Extra steps
    if (!options.dryRun) {
      console.log(result.claudeMdGenerated ? '✓  Generated CLAUDE.md' : '⏭  CLAUDE.md skipped');
      console.log(result.huskyInstalled ? '✓  Installed Husky post-commit hook' : '⏭  Husky hook skipped');
      console.log(result.snapshotSaved ? '✓  Snapshot saved to storage' : '⚠️  Snapshot not saved');
    }

    // Errors
    if (result.errors.length > 0) {
      console.log(`\n⚠️  ${result.errors.length} error(s):`);
      for (const e of result.errors) console.log(`   ✗ ${e}`);
    }

    console.log(
      options.dryRun
        ? '\n⚠️  Dry-run mode — no files written.\n'
        : '\n✅ Starter kit applied successfully!\n'
    );
  } finally {
    await storage.close();
  }
}
