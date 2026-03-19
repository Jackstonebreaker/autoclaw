import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { AutoClawConfigSchema, type AutoClawConfig } from './types.js';

const CONFIG_FILE = '.autoclaw/config.json';

/**
 * Load AutoClaw config from .autoclaw/config.json
 * Returns defaults if file doesn't exist
 */
export function loadConfig(cwd: string = process.cwd()): AutoClawConfig {
  const configPath = join(cwd, CONFIG_FILE);

  if (!existsSync(configPath)) {
    return AutoClawConfigSchema.parse({});
  }

  const raw = readFileSync(configPath, 'utf-8');
  const parsed: unknown = JSON.parse(raw);
  return AutoClawConfigSchema.parse(parsed);
}

