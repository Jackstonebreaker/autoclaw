import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readStarterKit, applyStarterKit, listStarterKits } from '../starter-kit.js';

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  readdirSync: vi.fn(),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

import { existsSync, readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';

const mockExistsSync = vi.mocked(existsSync);
const mockReadFileSync = vi.mocked(readFileSync);
const mockReaddirSync = vi.mocked(readdirSync);
const mockMkdirSync = vi.mocked(mkdirSync);
const mockWriteFileSync = vi.mocked(writeFileSync);

function dirent(name: string, isDir: boolean) {
  return { name, isDirectory: () => isDir, isFile: () => !isDir };
}

const validManifest = {
  name: 'test-kit',
  version: '1.0.0',
  description: 'Test starter kit',
  rules: [{ path: 'rules/security.md', category: 'security', severity: 'HIGH', target: 'universal', description: 'Security rules' }],
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ===================== readStarterKit =====================

describe('readStarterKit', () => {
  it('reads a valid starter kit with manifest', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync
      .mockReturnValueOnce(JSON.stringify(validManifest) as unknown as Buffer)
      .mockReturnValueOnce('# Security rule content' as unknown as Buffer);

    const kit = readStarterKit('/kits/test-kit');

    expect(kit.manifest.name).toBe('test-kit');
    expect(kit.manifest.version).toBe('1.0.0');
    expect(kit.rules).toHaveLength(1);
    expect(kit.rules[0]?.content).toBe('# Security rule content');
    expect(kit.basePath).toBe('/kits/test-kit');
  });

  it('throws if directory does not exist', () => {
    mockExistsSync.mockReturnValue(false);

    expect(() => readStarterKit('/kits/missing')).toThrow('Starter kit not found: /kits/missing');
  });

  it('throws if autoclaw-kit.json is missing', () => {
    mockExistsSync
      .mockReturnValueOnce(true)   // kitPath exists
      .mockReturnValueOnce(false); // manifestPath missing

    expect(() => readStarterKit('/kits/no-manifest')).toThrow('No autoclaw-kit.json found in: /kits/no-manifest');
  });

  it('throws if manifest is invalid (missing name/version/rules)', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValueOnce(JSON.stringify({ name: 'only-name' }) as unknown as Buffer);

    expect(() => readStarterKit('/kits/bad-manifest')).toThrow('Invalid autoclaw-kit.json: missing name, version, or rules');
  });

  it('warns and skips rule files that are absent from the manifest', () => {
    mockExistsSync
      .mockReturnValueOnce(true)   // kitPath
      .mockReturnValueOnce(true)   // manifestPath
      .mockReturnValueOnce(false); // rule file missing

    mockReadFileSync.mockReturnValueOnce(JSON.stringify(validManifest) as unknown as Buffer);

    const kit = readStarterKit('/kits/missing-rule-file');

    expect(kit.rules).toHaveLength(0);
  });
});

// ===================== applyStarterKit =====================

const baseKit = {
  manifest: validManifest,
  basePath: '/kits/test-kit',
  rules: [{ rule: validManifest.rules[0]!, content: '# Security' }],
};

describe('applyStarterKit', () => {
  it('writes rule files to the target directory', () => {
    mockExistsSync.mockReturnValue(false); // file does not exist → will write

    const result = applyStarterKit(baseKit, '/project');

    expect(mockMkdirSync).toHaveBeenCalled();
    expect(mockWriteFileSync).toHaveBeenCalledWith(
      expect.stringContaining('security.md'),
      '# Security',
      'utf-8'
    );
    expect(result.applied).toContain('rules/security.md');
    expect(result.skipped).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });

  it('skips files that already exist when overwrite=false', () => {
    mockExistsSync.mockReturnValue(true); // file exists

    const result = applyStarterKit(baseKit, '/project', { overwrite: false });

    expect(mockWriteFileSync).not.toHaveBeenCalled();
    expect(result.skipped).toContain('rules/security.md');
    expect(result.applied).toHaveLength(0);
  });

  it('overwrites files when overwrite=true', () => {
    mockExistsSync.mockReturnValue(true); // file exists but overwrite enabled

    const result = applyStarterKit(baseKit, '/project', { overwrite: true });

    expect(mockWriteFileSync).toHaveBeenCalled();
    expect(result.applied).toContain('rules/security.md');
    expect(result.skipped).toHaveLength(0);
  });

  it('does not write files in dry-run mode', () => {
    mockExistsSync.mockReturnValue(false);

    const result = applyStarterKit(baseKit, '/project', { dryRun: true });

    expect(mockWriteFileSync).not.toHaveBeenCalled();
    expect(mockMkdirSync).not.toHaveBeenCalled();
    expect(result.applied).toContain('rules/security.md');
  });

  it('merges kit config into .autoclaw.json', () => {
    const kitWithConfig = {
      ...baseKit,
      manifest: { ...validManifest, config: { storage: 'sqlite' } },
      rules: [],
    };

    // .autoclaw.json does not exist yet
    mockExistsSync.mockReturnValue(false);
    mockReadFileSync.mockReturnValueOnce('{}' as unknown as Buffer);

    const result = applyStarterKit(kitWithConfig, '/project');

    expect(mockWriteFileSync).toHaveBeenCalledWith(
      expect.stringContaining('.autoclaw.json'),
      expect.stringContaining('sqlite'),
      'utf-8'
    );
    expect(result.applied).toContain('.autoclaw.json');
  });
});

// ===================== listStarterKits =====================

describe('listStarterKits', () => {
  it('lists all starter kits found in a registry directory', () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue([dirent('kit-a', true)] as ReturnType<typeof readdirSync>);
    // manifest exists check + read
    mockExistsSync.mockReturnValueOnce(true).mockReturnValueOnce(true);
    mockReadFileSync.mockReturnValueOnce(JSON.stringify(validManifest) as unknown as Buffer);

    const kits = listStarterKits('/registry');

    expect(kits.length).toBeGreaterThan(0);
  });

  it('returns empty array if registry directory does not exist', () => {
    mockExistsSync.mockReturnValue(false);

    const kits = listStarterKits('/registry/missing');

    expect(kits).toHaveLength(0);
    expect(mockReaddirSync).not.toHaveBeenCalled();
  });
});

