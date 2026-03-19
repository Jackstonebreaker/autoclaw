import { existsSync, readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createLogger } from './logger.js';

const logger = createLogger('starter-kit');

export interface StarterKitManifest {
  name: string;
  version: string;
  description: string;
  rules: StarterKitRule[];
  config?: Record<string, unknown>;
}

export interface StarterKitRule {
  path: string;
  category: string;
  severity: string;
  target: string;
  description: string;
}

export interface StarterKit {
  manifest: StarterKitManifest;
  basePath: string;
  rules: { rule: StarterKitRule; content: string }[];
}

/**
 * Read a starter kit from a local directory
 */
export function readStarterKit(kitPath: string): StarterKit {
  logger.info(`Reading starter kit from: ${kitPath}`);

  if (!existsSync(kitPath)) {
    throw new Error(`Starter kit not found: ${kitPath}`);
  }

  const manifestPath = join(kitPath, 'autoclaw-kit.json');
  if (!existsSync(manifestPath)) {
    throw new Error(`No autoclaw-kit.json found in: ${kitPath}`);
  }

  const manifestRaw = readFileSync(manifestPath, 'utf-8');
  const manifest: StarterKitManifest = JSON.parse(manifestRaw) as StarterKitManifest;

  if (!manifest.name || !manifest.version || !Array.isArray(manifest.rules)) {
    throw new Error('Invalid autoclaw-kit.json: missing name, version, or rules');
  }

  const rules: { rule: StarterKitRule; content: string }[] = [];
  for (const rule of manifest.rules) {
    const rulePath = join(kitPath, rule.path);
    if (!existsSync(rulePath)) {
      logger.warn(`Rule file not found: ${rule.path}`);
      continue;
    }
    const content = readFileSync(rulePath, 'utf-8');
    rules.push({ rule, content });
  }

  logger.info(`Loaded starter kit "${manifest.name}" with ${rules.length} rules`);
  return { manifest, basePath: kitPath, rules };
}

/**
 * Apply a starter kit to a project directory
 */
export function applyStarterKit(
  kit: StarterKit,
  targetDir: string,
  options: { overwrite?: boolean; dryRun?: boolean } = {}
): { applied: string[]; skipped: string[]; errors: string[] } {
  const applied: string[] = [];
  const skipped: string[] = [];
  const errors: string[] = [];

  logger.info(`Applying starter kit "${kit.manifest.name}" to ${targetDir}`);

  for (const { rule, content } of kit.rules) {
    const targetPath = join(targetDir, rule.path);
    const targetDirPath = join(targetPath, '..');

    if (existsSync(targetPath) && !options.overwrite) {
      logger.info(`Skipping existing: ${rule.path}`);
      skipped.push(rule.path);
      continue;
    }

    if (options.dryRun) {
      logger.info(`[dry-run] Would write: ${rule.path}`);
      applied.push(rule.path);
      continue;
    }

    try {
      mkdirSync(targetDirPath, { recursive: true });
      writeFileSync(targetPath, content, 'utf-8');
      applied.push(rule.path);
      logger.info(`Applied: ${rule.path}`);
    } catch (err) {
      const msg = `Failed to write ${rule.path}: ${err instanceof Error ? err.message : String(err)}`;
      logger.error(msg);
      errors.push(msg);
    }
  }

  if (kit.manifest.config && !options.dryRun) {
    try {
      const configPath = join(targetDir, '.autoclaw.json');
      const existingConfig = existsSync(configPath)
        ? (JSON.parse(readFileSync(configPath, 'utf-8')) as Record<string, unknown>)
        : {};
      const merged = { ...existingConfig, ...kit.manifest.config };
      writeFileSync(configPath, JSON.stringify(merged, null, 2), 'utf-8');
      applied.push('.autoclaw.json');
    } catch (err) {
      errors.push(`Config merge failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  logger.info(`Applied: ${applied.length}, Skipped: ${skipped.length}, Errors: ${errors.length}`);
  return { applied, skipped, errors };
}

/**
 * List available starter kits from a registry directory
 */
export function listStarterKits(registryDir: string): StarterKitManifest[] {
  if (!existsSync(registryDir)) return [];

  const kits: StarterKitManifest[] = [];
  const entries = readdirSync(registryDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const manifestPath = join(registryDir, entry.name, 'autoclaw-kit.json');
    if (!existsSync(manifestPath)) continue;

    try {
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as StarterKitManifest;
      kits.push(manifest);
    } catch {
      logger.warn(`Invalid manifest in: ${entry.name}`);
    }
  }

  return kits;
}

