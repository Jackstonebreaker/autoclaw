import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readRules } from '../rules-reader.js';

// Mock the node:fs module
vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readdirSync: vi.fn(),
  readFileSync: vi.fn(),
  statSync: vi.fn(),
}));

import { existsSync, readdirSync, readFileSync } from 'node:fs';

const mockExistsSync = vi.mocked(existsSync);
const mockReaddirSync = vi.mocked(readdirSync);
const mockReadFileSync = vi.mocked(readFileSync);

// Helper to build a dirent-like object
function dirent(name: string, isDir: boolean) {
  return { name, isDirectory: () => isDir, isFile: () => !isDir };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('readRules', () => {
  it('reads .md files from an existing directory', () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue([dirent('rule.md', false)] as ReturnType<typeof readdirSync>);
    mockReadFileSync.mockReturnValue('# Rule content' as unknown as Buffer);

    const rules = readRules('/project', ['.claude/rules']);

    expect(rules).toHaveLength(1);
    expect(rules[0]?.fileName).toBe('rule.md');
    expect(rules[0]?.content).toBe('# Rule content');
    expect(rules[0]?.sourceDir).toBe('.claude/rules');
  });

  it('skips a directory that does not exist without throwing', () => {
    mockExistsSync.mockReturnValue(false);

    const rules = readRules('/project', ['.missing/rules']);

    expect(rules).toHaveLength(0);
    expect(mockReaddirSync).not.toHaveBeenCalled();
  });

  it('skips non-.md files', () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue([
      dirent('rule.md', false),
      dirent('config.json', false),
      dirent('readme.txt', false),
    ] as ReturnType<typeof readdirSync>);
    mockReadFileSync.mockReturnValue('# content' as unknown as Buffer);

    const rules = readRules('/project', ['.claude/rules']);

    expect(rules).toHaveLength(1);
    expect(rules[0]?.fileName).toBe('rule.md');
  });

  it('reads files recursively from sub-directories', () => {
    mockExistsSync.mockReturnValue(true);
    // First call returns the root dir with one subdir + one file
    // Second call (recursive) returns a file inside the subdir
    mockReaddirSync
      .mockReturnValueOnce([
        dirent('subdir', true),
        dirent('top.md', false),
      ] as ReturnType<typeof readdirSync>)
      .mockReturnValueOnce([
        dirent('nested.md', false),
      ] as ReturnType<typeof readdirSync>);

    mockReadFileSync.mockReturnValue('content' as unknown as Buffer);

    const rules = readRules('/project', ['.augment/rules']);

    expect(rules).toHaveLength(2);
    const fileNames = rules.map(r => r.fileName);
    expect(fileNames).toContain('top.md');
    expect(fileNames).toContain('nested.md');
  });

  it('returns an empty array when directory has no .md files', () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue([] as ReturnType<typeof readdirSync>);

    const rules = readRules('/project', ['.cursor/rules']);

    expect(rules).toHaveLength(0);
  });
});

