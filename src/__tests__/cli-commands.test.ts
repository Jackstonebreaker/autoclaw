import { describe, it, expect, vi } from 'vitest';

// --- All mocks must be hoisted before any imports ---
vi.mock('../logger.js', () => ({
  createLogger: vi.fn().mockReturnValue({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));
vi.mock('../config.js', () => ({
  loadConfig: vi.fn().mockReturnValue({ storage: 'file', targetDirs: ['.claude/rules'], suggestionThreshold: 0.7, autoApproveThreshold: 0.9 }),
}));
vi.mock('../storage/index.js', () => ({
  createStorage: vi.fn().mockReturnValue({ initialize: vi.fn().mockResolvedValue(undefined), close: vi.fn().mockResolvedValue(undefined) }),
}));
vi.mock('../session-analyzer.js', () => ({
  analyzeSession: vi.fn().mockResolvedValue({ sessionId: 'test', patterns: [], commitCount: 0, filesChanged: 0, quality: {} }),
}));
vi.mock('../pattern-detector.js', () => ({
  detectCrossSessionPatterns: vi.fn().mockResolvedValue({ newPatterns: [], recurringPatterns: [], crossSessionMatches: [] }),
}));
vi.mock('../rule-suggester.js', () => ({
  generateRuleSuggestions: vi.fn().mockResolvedValue([]),
}));
vi.mock('../rule-applier.js', () => ({
  autoApproveHighConfidenceRules: vi.fn().mockResolvedValue([]),
  applyAllPendingRules: vi.fn().mockResolvedValue({ applied: 0, skipped: 0 }),
}));
vi.mock('../orchestrator.js', () => ({
  runPipeline: vi.fn().mockResolvedValue({ sessionId: 'test', totalDuration: 0, steps: {} }),
}));
vi.mock('../doc-syncer.js', () => ({
  checkDocSync: vi.fn().mockResolvedValue({ missingFromDocs: [], agentsMdStale: false }),
}));
vi.mock('../starter-kit-distributor.js', () => ({
  distributeStarterKit: vi.fn().mockResolvedValue({ applied: [], skipped: [], errors: [], claudeMdGenerated: false, huskyInstalled: false, snapshotSaved: false }),
}));
vi.mock('../rules-auditor.js', () => ({
  auditRules: vi.fn().mockResolvedValue({ totalRulesScanned: 0, classified: 0, consolidated: 0, overlapsDetected: 0, generated: 0, coveragePercent: 100, categories: {}, severities: {} }),
}));
vi.mock('../rules-generator.js', () => ({
  generateUniversalRules: vi.fn().mockResolvedValue({ filesWritten: 0, filesSkipped: 0 }),
}));
vi.mock('../starter-kit-syncer.js', () => ({
  checkSync: vi.fn().mockReturnValue({ rules: [], summary: { upToDate: 0, outdated: 0, missing: 0, custom: 0 }, hasCriticalMissing: false }),
  applySync: vi.fn().mockReturnValue({ updated: [], created: [], preserved: [], errors: [], commitMessage: 'chore: sync' }),
}));
vi.mock('../types.js', () => ({
  AutoClawConfigSchema: { parse: vi.fn().mockReturnValue({ storage: 'file', targetDirs: ['.claude/rules'] }) },
}));
vi.mock('node:fs', () => ({
  mkdirSync: vi.fn(), writeFileSync: vi.fn(), existsSync: vi.fn().mockReturnValue(false),
}));
vi.mock('node:child_process', () => ({ execSync: vi.fn() }));

import { Command } from 'commander';
import { registerAnalyzeCommand } from '../cli/commands/analyze.js';
import { registerDetectCommand } from '../cli/commands/detect.js';
import { registerSuggestCommand } from '../cli/commands/suggest.js';
import { registerApplyCommand } from '../cli/commands/apply.js';
import { registerRunCommand } from '../cli/commands/run.js';
import { registerStatusCommand } from '../cli/commands/status.js';
import { registerInitCommand } from '../cli/commands/init.js';
import { registerRulesCommand } from '../cli/commands/rules.js';
import { registerSyncCommand } from '../cli/commands/sync.js';

/** Create a fresh Commander program with one registered command */
function makeProgram(registerFn: (p: Command) => void): Command {
  const p = new Command();
  p.exitOverride(); // prevent process.exit during tests
  registerFn(p);
  return p;
}

/** Extract long flag names from a command's options */
function flags(cmd: Command): string[] {
  return cmd.options.map(o => o.long ?? '');
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('CLI Commands — structure and flags', () => {
  describe('analyze', () => {
    it('is registered in Commander', () => {
      expect(makeProgram(registerAnalyzeCommand).commands.find(c => c.name() === 'analyze')).toBeDefined();
    });
    it('has --dry-run, --storage, --since', () => {
      const p = makeProgram(registerAnalyzeCommand);
      const f = flags(p.commands.find(c => c.name() === 'analyze')!);
      expect(f).toContain('--dry-run');
      expect(f).toContain('--storage');
      expect(f).toContain('--since');
    });
  });

  describe('detect', () => {
    it('is registered in Commander', () => {
      expect(makeProgram(registerDetectCommand).commands.find(c => c.name() === 'detect')).toBeDefined();
    });
    it('has --dry-run, --storage, --since', () => {
      const p = makeProgram(registerDetectCommand);
      const f = flags(p.commands.find(c => c.name() === 'detect')!);
      expect(f).toContain('--dry-run');
      expect(f).toContain('--storage');
      expect(f).toContain('--since');
    });
  });

  describe('suggest', () => {
    it('is registered in Commander', () => {
      expect(makeProgram(registerSuggestCommand).commands.find(c => c.name() === 'suggest')).toBeDefined();
    });
    it('has --dry-run, --storage, --since, --threshold', () => {
      const p = makeProgram(registerSuggestCommand);
      const f = flags(p.commands.find(c => c.name() === 'suggest')!);
      expect(f).toContain('--dry-run');
      expect(f).toContain('--storage');
      expect(f).toContain('--since');
      expect(f).toContain('--threshold');
    });
  });

  describe('apply', () => {
    it('is registered in Commander', () => {
      expect(makeProgram(registerApplyCommand).commands.find(c => c.name() === 'apply')).toBeDefined();
    });
    it('has --dry-run, --storage', () => {
      const p = makeProgram(registerApplyCommand);
      const f = flags(p.commands.find(c => c.name() === 'apply')!);
      expect(f).toContain('--dry-run');
      expect(f).toContain('--storage');
    });
  });

  describe('run', () => {
    it('is registered in Commander', () => {
      expect(makeProgram(registerRunCommand).commands.find(c => c.name() === 'run')).toBeDefined();
    });
    it('has --dry-run, --storage, --since', () => {
      const p = makeProgram(registerRunCommand);
      const f = flags(p.commands.find(c => c.name() === 'run')!);
      expect(f).toContain('--dry-run');
      expect(f).toContain('--storage');
      expect(f).toContain('--since');
    });
  });

  describe('status', () => {
    it('is registered in Commander', () => {
      expect(makeProgram(registerStatusCommand).commands.find(c => c.name() === 'status')).toBeDefined();
    });
    it('has --storage, --dry-run', () => {
      const p = makeProgram(registerStatusCommand);
      const f = flags(p.commands.find(c => c.name() === 'status')!);
      expect(f).toContain('--storage');
      expect(f).toContain('--dry-run');
    });
  });

  describe('init', () => {
    it('is registered in Commander', () => {
      expect(makeProgram(registerInitCommand).commands.find(c => c.name() === 'init')).toBeDefined();
    });
    it('has --cwd, --from-starter-kit, --dry-run, --storage, --project-name, --overwrite', () => {
      const p = makeProgram(registerInitCommand);
      const f = flags(p.commands.find(c => c.name() === 'init')!);
      expect(f).toContain('--cwd');
      expect(f).toContain('--from-starter-kit');
      expect(f).toContain('--dry-run');
      expect(f).toContain('--storage');
      expect(f).toContain('--project-name');
      expect(f).toContain('--overwrite');
    });
  });

  describe('rules', () => {
    it('registers the rules parent command', () => {
      expect(makeProgram(registerRulesCommand).commands.find(c => c.name() === 'rules')).toBeDefined();
    });
    it('registers the audit subcommand with --dry-run, --output, --storage, --path', () => {
      const p = makeProgram(registerRulesCommand);
      const rulesCmd = p.commands.find(c => c.name() === 'rules')!;
      const auditCmd = rulesCmd.commands.find(c => c.name() === 'audit');
      expect(auditCmd).toBeDefined();
      const f = flags(auditCmd!);
      expect(f).toContain('--dry-run');
      expect(f).toContain('--output');
      expect(f).toContain('--storage');
      expect(f).toContain('--path');
    });
    it('registers the generate subcommand with --dry-run, --output, --storage, --sources', () => {
      const p = makeProgram(registerRulesCommand);
      const rulesCmd = p.commands.find(c => c.name() === 'rules')!;
      const generateCmd = rulesCmd.commands.find(c => c.name() === 'generate');
      expect(generateCmd).toBeDefined();
      const f = flags(generateCmd!);
      expect(f).toContain('--dry-run');
      expect(f).toContain('--output');
      expect(f).toContain('--storage');
      expect(f).toContain('--sources');
    });
  });

  describe('sync', () => {
    it('is registered in Commander', () => {
      expect(makeProgram(registerSyncCommand).commands.find(c => c.name() === 'sync')).toBeDefined();
    });
    it('has --kit, --check, --apply, --dry-run, --storage, --custom-rules', () => {
      const p = makeProgram(registerSyncCommand);
      const f = flags(p.commands.find(c => c.name() === 'sync')!);
      expect(f).toContain('--kit');
      expect(f).toContain('--check');
      expect(f).toContain('--apply');
      expect(f).toContain('--dry-run');
      expect(f).toContain('--storage');
      expect(f).toContain('--custom-rules');
    });
    it('marks --kit as a required (mandatory) option', () => {
      const p = makeProgram(registerSyncCommand);
      const syncCmd = p.commands.find(c => c.name() === 'sync')!;
      const kitOpt = syncCmd.options.find(o => o.long === '--kit');
      expect(kitOpt?.mandatory).toBe(true);
    });
  });
});
