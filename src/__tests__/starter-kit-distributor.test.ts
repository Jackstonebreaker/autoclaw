import { describe, it, expect, vi, beforeEach } from 'vitest';
import { distributeStarterKit, inferProjectName } from '../starter-kit-distributor.js';

// --- fs mock ---
vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

// --- child_process mock (execSync for Husky availability check) ---
vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
}));

// --- starter-kit mock ---
vi.mock('../starter-kit.js', () => ({
  readStarterKit: vi.fn(),
  applyStarterKit: vi.fn(),
}));

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { readStarterKit, applyStarterKit } from '../starter-kit.js';

const mockExecSync = vi.mocked(execSync);

const mockExistsSync = vi.mocked(existsSync);
const mockReadFileSync = vi.mocked(readFileSync);
const mockWriteFileSync = vi.mocked(writeFileSync);
const mockMkdirSync = vi.mocked(mkdirSync);
const mockReadStarterKit = vi.mocked(readStarterKit);
const mockApplyStarterKit = vi.mocked(applyStarterKit);

const fakeKit = {
  manifest: { name: 'my-kit', version: '2.0.0', description: 'Test kit', rules: [] },
  basePath: '/kits/my-kit',
  rules: [
    { rule: { path: 'rules/lint.md', category: 'style', severity: 'INFO', target: 'universal', description: 'Lint rules' }, content: '# Lint' },
  ],
};

const makeStorage = () => ({
  initialize: vi.fn().mockResolvedValue(undefined),
  saveSnapshot: vi.fn().mockResolvedValue(undefined),
  close: vi.fn().mockResolvedValue(undefined),
  savePattern: vi.fn(), getPatterns: vi.fn(), getPatternById: vi.fn(), updatePattern: vi.fn(),
  saveRule: vi.fn(), getRules: vi.fn(), getRuleById: vi.fn(), updateRule: vi.fn(),
  saveRuleVersion: vi.fn(), getRuleVersions: vi.fn(),
  saveSession: vi.fn(), getSessions: vi.fn(), getSessionById: vi.fn(),
  saveAlert: vi.fn(), getAlerts: vi.fn(), acknowledgeAlert: vi.fn(),
  saveConsolidatedRule: vi.fn(), getConsolidatedRules: vi.fn(),
  getLatestSnapshot: vi.fn(),
});

beforeEach(() => {
  vi.clearAllMocks();
  mockReadStarterKit.mockReturnValue(fakeKit);
  mockApplyStarterKit.mockReturnValue({ applied: ['rules/lint.md'], skipped: [], errors: [] });
  // By default: no CLAUDE.md template in kit, no package.json in target
  mockExistsSync.mockReturnValue(false);
  // By default: Husky is available
  mockExecSync.mockReturnValue(Buffer.from(''));
});

// ===================== distributeStarterKit =====================

describe('distributeStarterKit', () => {
  it('applies rules, generates CLAUDE.md, installs Husky, saves snapshot on full run', async () => {
    const storage = makeStorage();
    const result = await distributeStarterKit('/kits/my-kit', '/target', storage);

    expect(result.applied).toContain('rules/lint.md');
    expect(result.claudeMdGenerated).toBe(true);
    expect(result.huskyInstalled).toBe(true);
    expect(result.snapshotSaved).toBe(true);
    expect(storage.saveSnapshot).toHaveBeenCalledOnce();
    expect(mockMkdirSync).toHaveBeenCalled();
  });

  it('dry-run returns result without writing any files', async () => {
    const storage = makeStorage();
    const result = await distributeStarterKit('/kits/my-kit', '/target', storage, { dryRun: true });

    expect(result.claudeMdGenerated).toBe(false);
    expect(result.huskyInstalled).toBe(false);
    expect(result.snapshotSaved).toBe(false);
    expect(storage.saveSnapshot).not.toHaveBeenCalled();
    expect(mockWriteFileSync).not.toHaveBeenCalled();
  });

  it('CLAUDE.md does not contain [ADAPTER] or [PROJECT_NAME] placeholders', async () => {
    // Kit has a CLAUDE.md template with placeholders
    mockExistsSync.mockImplementation((p: string | Buffer | URL) =>
      typeof p === 'string' && p.endsWith('CLAUDE.md')
    );
    mockReadFileSync.mockReturnValue(
      '# [PROJECT_NAME]\n> Kit [KIT_VERSION]\n[ADAPTER] rules\n' as unknown as Buffer
    );
    const storage = makeStorage();
    await distributeStarterKit('/kits/my-kit', '/target', storage, { projectName: 'my-app' });

    const writtenContent = mockWriteFileSync.mock.calls.find(
      (c) => typeof c[0] === 'string' && (c[0] as string).endsWith('CLAUDE.md')
    )?.[1] as string | undefined;

    expect(writtenContent).toBeDefined();
    expect(writtenContent).not.toContain('[ADAPTER]');
    expect(writtenContent).not.toContain('[PROJECT_NAME]');
    expect(writtenContent).toContain('my-app');
  });

  it('skips Husky when skipHusky=true', async () => {
    const storage = makeStorage();
    const result = await distributeStarterKit('/kits/my-kit', '/target', storage, { skipHusky: true });

    expect(result.huskyInstalled).toBe(false);
    const huskyWrite = mockWriteFileSync.mock.calls.find(
      (c) => typeof c[0] === 'string' && (c[0] as string).includes('.husky')
    );
    expect(huskyWrite).toBeUndefined();
  });

  it('Husky hook file contains expected autoclaw invocation', async () => {
    const storage = makeStorage();
    await distributeStarterKit('/kits/my-kit', '/target', storage);

    const huskyWrite = mockWriteFileSync.mock.calls.find(
      (c) => typeof c[0] === 'string' && (c[0] as string).endsWith('post-commit')
    );
    expect(huskyWrite).toBeDefined();
    expect(huskyWrite?.[1]).toContain('npx autoclaw run');
  });

  it('snapshot is saved via storage.saveSnapshot with correct shape', async () => {
    const storage = makeStorage();
    await distributeStarterKit('/kits/my-kit', '/target', storage);

    const snap = storage.saveSnapshot.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(snap).toMatchObject({
      version: '2.0.0',
      starterKitPath: '/kits/my-kit',
      totalFiles: 1,
    });
    expect(snap['capturedAt']).toBeDefined();
    expect(Array.isArray(snap['files'])).toBe(true);
  });

  it('records error but continues when snapshot save fails', async () => {
    const storage = makeStorage();
    storage.saveSnapshot.mockRejectedValue(new Error('DB down'));
    const result = await distributeStarterKit('/kits/my-kit', '/target', storage);

    expect(result.snapshotSaved).toBe(false);
    expect(result.errors.some((e) => e.includes('Snapshot save failed'))).toBe(true);
    expect(result.claudeMdGenerated).toBe(true); // other steps still ran
  });

  it('throws when readStarterKit throws (invalid kit)', async () => {
    mockReadStarterKit.mockImplementation(() => { throw new Error('No manifest'); });
    const storage = makeStorage();
    await expect(distributeStarterKit('/bad-kit', '/target', storage)).rejects.toThrow('No manifest');
  });
});

// ===================== inferProjectName =====================

describe('inferProjectName', () => {
  it('reads name from package.json when present', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify({ name: 'my-package' }) as unknown as Buffer);

    const name = inferProjectName('/some/project');
    expect(name).toBe('my-package');
  });

  it('falls back to directory name when no package.json', () => {
    mockExistsSync.mockReturnValue(false);
    const name = inferProjectName('/some/my-project');
    expect(name).toBe('my-project');
  });
});

