import { Command } from 'commander';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { createLogger } from '../../logger.js';
import { AutoClawConfigSchema } from '../../types.js';

const logger = createLogger('cli:init');

const DEFAULT_DIRS = ['.claude/rules', '.augment/rules', '.cursor/rules'];

export function registerInitCommand(program: Command): void {
  program
    .command('init')
    .description('Initialize AutoClaw in the current project')
    .option('--cwd <path>', 'Working directory', process.cwd())
    .action(async (options: { cwd: string }) => {
      const cwd = options.cwd;

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

