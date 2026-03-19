import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

vi.mock('../starter-kit.js', () => ({
  readStarterKit: vi.fn(),
}));

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { readStarterKit } from '../starter-kit.js';
import { checkSync, applySync } from '../starter-kit-syncer.js';

const mockExistsSync = vi.mocked(existsSync);
const mockReadFileSync = vi.mocked(readFileSync);
const mockWriteFileSync = vi.mocked(writeFileSync);
const mockMkdirSync = vi.mocked(mkdirSync);
const mockReadStarterKit = vi.mocked(readStarterKit);

// sha256 of 'template content'
const TEMPLATE_CONTENT = 'template content';

const makeKit = (severity = 'MAJOR', path = 'rules/test.md') => ({
  manifest: { name: 'test-kit', version: '1.2.3', description: 'test', rules: [] },
  basePath: '/kit',
  rules: [{ rule: { path, category: 'security', severity, target: 'universal', description: 'desc' }, content: TEMPLATE_CONTENT }],
});

beforeEach(() => {
  vi.clearAllMocks();
});

// ===================== checkSync =====================

describe('checkSync', () => {
  it('detects up-to-date rule when local content matches template', () => {
    mockReadStarterKit.mockReturnValue(makeKit());
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(TEMPLATE_CONTENT as unknown as Buffer);

    const result = checkSync('/kit', '/project');

    expect(result.rules[0]?.status).toBe('up-to-date');
    expect(result.summary.upToDate).toBe(1);
    expect(result.hasOutdated).toBe(false);
    expect(result.hasMissing).toBe(false);
  });

  it('detects outdated rule when local content differs from template', () => {
    mockReadStarterKit.mockReturnValue(makeKit());
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue('different content' as unknown as Buffer);

    const result = checkSync('/kit', '/project');

    expect(result.rules[0]?.status).toBe('outdated');
    expect(result.summary.outdated).toBe(1);
    expect(result.hasOutdated).toBe(true);
  });

  it('detects missing rule when local file does not exist', () => {
    mockReadStarterKit.mockReturnValue(makeKit());
    mockExistsSync.mockReturnValue(false);

    const result = checkSync('/kit', '/project');

    expect(result.rules[0]?.status).toBe('missing');
    expect(result.summary.missing).toBe(1);
    expect(result.hasMissing).toBe(true);
  });

  it('marks rule as custom when path is in customRules', () => {
    mockReadStarterKit.mockReturnValue(makeKit());

    const result = checkSync('/kit', '/project', ['rules/test.md']);

    expect(result.rules[0]?.status).toBe('custom');
    expect(result.summary.custom).toBe(1);
  });

  it('sets hasCriticalMissing=true when a CRITICAL rule is missing', () => {
    mockReadStarterKit.mockReturnValue(makeKit('CRITICAL'));
    mockExistsSync.mockReturnValue(false);

    const result = checkSync('/kit', '/project');

    expect(result.hasCriticalMissing).toBe(true);
  });

  it('sets hasCriticalMissing=false for non-critical missing rules', () => {
    mockReadStarterKit.mockReturnValue(makeKit('MAJOR'));
    mockExistsSync.mockReturnValue(false);

    const result = checkSync('/kit', '/project');

    expect(result.hasCriticalMissing).toBe(false);
  });

  it('returns correct summary counts', () => {
    const kit = {
      manifest: { name: 'k', version: '1', description: 'd', rules: [] },
      basePath: '/kit',
      rules: [
        { rule: { path: 'a.md', category: 'c', severity: 'INFO', target: 'u', description: 'd' }, content: TEMPLATE_CONTENT },
        { rule: { path: 'b.md', category: 'c', severity: 'INFO', target: 'u', description: 'd' }, content: 'other' },
        { rule: { path: 'c.md', category: 'c', severity: 'INFO', target: 'u', description: 'd' }, content: TEMPLATE_CONTENT },
      ],
    };
    mockReadStarterKit.mockReturnValue(kit);
    // a.md exists + matches, b.md missing, c.md custom
    mockExistsSync
      .mockReturnValueOnce(true)  // a.md
      .mockReturnValueOnce(false); // b.md
    mockReadFileSync.mockReturnValue(TEMPLATE_CONTENT as unknown as Buffer);

    const result = checkSync('/kit', '/project', ['c.md']);

    expect(result.summary.upToDate).toBe(1);
    expect(result.summary.missing).toBe(1);
    expect(result.summary.custom).toBe(1);
  });
});

// ===================== applySync =====================

describe('applySync', () => {
  it('creates missing files', () => {
    mockReadStarterKit.mockReturnValue(makeKit());
    mockExistsSync.mockReturnValue(false);

    const result = applySync('/kit', '/project');

    expect(mockMkdirSync).toHaveBeenCalled();
    expect(mockWriteFileSync).toHaveBeenCalledWith(expect.stringContaining('test.md'), TEMPLATE_CONTENT, 'utf-8');
    expect(result.created).toContain('rules/test.md');
    expect(result.errors).toHaveLength(0);
  });

  it('updates outdated files', () => {
    mockReadStarterKit.mockReturnValue(makeKit());
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue('old content' as unknown as Buffer);

    const result = applySync('/kit', '/project');

    expect(mockWriteFileSync).toHaveBeenCalled();
    expect(result.updated).toContain('rules/test.md');
    expect(result.created).toHaveLength(0);
  });

  it('preserves custom rules without writing', () => {
    mockReadStarterKit.mockReturnValue(makeKit());

    const result = applySync('/kit', '/project', ['rules/test.md']);

    expect(mockWriteFileSync).not.toHaveBeenCalled();
    expect(result.preserved).toContain('rules/test.md');
    expect(result.created).toHaveLength(0);
    expect(result.updated).toHaveLength(0);
  });

  it('does not write files in dry-run mode — missing file', () => {
    mockReadStarterKit.mockReturnValue(makeKit());
    mockExistsSync.mockReturnValue(false);

    const result = applySync('/kit', '/project', [], { dryRun: true });

    expect(mockWriteFileSync).not.toHaveBeenCalled();
    expect(mockMkdirSync).not.toHaveBeenCalled();
    expect(result.created).toContain('rules/test.md');
  });

  it('does not write files in dry-run mode — outdated file', () => {
    mockReadStarterKit.mockReturnValue(makeKit());
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue('old content' as unknown as Buffer);

    const result = applySync('/kit', '/project', [], { dryRun: true });

    expect(mockWriteFileSync).not.toHaveBeenCalled();
    expect(result.updated).toContain('rules/test.md');
  });

  it('returns correct commitMessage with kit version', () => {
    mockReadStarterKit.mockReturnValue(makeKit());
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(TEMPLATE_CONTENT as unknown as Buffer);

    const result = applySync('/kit', '/project');

    expect(result.commitMessage).toBe('chore: sync rules from autoclaw template v1.2.3');
  });
});

