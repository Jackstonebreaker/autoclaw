import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoist mocks so they are available before module imports
const { mockExistsSync, mockReadFileSync } = vi.hoisted(() => {
  return {
    mockExistsSync: vi.fn(),
    mockReadFileSync: vi.fn(),
  };
});

vi.mock('node:fs', () => ({
  existsSync: mockExistsSync,
  readFileSync: mockReadFileSync,
}));

import { loadConfig } from '../config.js';

describe('loadConfig()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns defaults when config file does not exist', () => {
    mockExistsSync.mockReturnValue(false);

    const config = loadConfig('/fake/cwd');

    expect(mockExistsSync).toHaveBeenCalledWith('/fake/cwd/.autoclaw/config.json');
    expect(mockReadFileSync).not.toHaveBeenCalled();
    expect(config.version).toBe('1.0.0');
    expect(config.storage).toBe('file');
    expect(config.autoApproveThreshold).toBe(0.70);
    expect(config.suggestionThreshold).toBe(0.70);
    expect(config.targetDirs).toEqual(['.claude/rules', '.augment/rules', '.cursor/rules']);
  });

  it('parses config from file when it exists', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify({
      version: '2.0.0',
      storage: 'sqlite',
      autoApproveThreshold: 0.85,
      suggestionThreshold: 0.60,
    }));

    const config = loadConfig('/project');

    expect(mockReadFileSync).toHaveBeenCalledWith('/project/.autoclaw/config.json', 'utf-8');
    expect(config.version).toBe('2.0.0');
    expect(config.storage).toBe('sqlite');
    expect(config.autoApproveThreshold).toBe(0.85);
    expect(config.suggestionThreshold).toBe(0.60);
  });

  it('merges partial config with defaults', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify({ storage: 'supabase' }));

    const config = loadConfig('/project');

    expect(config.storage).toBe('supabase');
    expect(config.version).toBe('1.0.0'); // default
    expect(config.autoApproveThreshold).toBe(0.70); // default
  });

  it('uses process.cwd() when no cwd argument provided', () => {
    mockExistsSync.mockReturnValue(false);

    loadConfig();

    const expectedPath = `${process.cwd()}/.autoclaw/config.json`;
    expect(mockExistsSync).toHaveBeenCalledWith(expectedPath);
  });

  it('throws on invalid JSON', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue('{ invalid json }');

    expect(() => loadConfig('/project')).toThrow();
  });

  it('throws on invalid config values (Zod validation)', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify({
      storage: 'invalid-backend',
    }));

    expect(() => loadConfig('/project')).toThrow();
  });
});

