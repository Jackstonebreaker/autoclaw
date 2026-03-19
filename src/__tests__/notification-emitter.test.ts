import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:fs', () => ({
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  existsSync: vi.fn().mockReturnValue(false),
  readFileSync: vi.fn().mockReturnValue(''),
}));

import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import { emitNotifications } from '../notification-emitter.js';
import type { StorageAdapter } from '../storage/adapter.js';
import type { AgentAlert } from '../types.js';

const mockWriteFileSync = vi.mocked(writeFileSync);
const mockExistsSync = vi.mocked(existsSync);
const mockReadFileSync = vi.mocked(readFileSync);

function createMockStorage(): StorageAdapter {
  return {
    initialize: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    savePattern: vi.fn().mockResolvedValue(undefined),
    getPatterns: vi.fn().mockResolvedValue([]),
    getPatternById: vi.fn().mockResolvedValue(null),
    updatePattern: vi.fn().mockResolvedValue(undefined),
    saveRule: vi.fn().mockResolvedValue(undefined),
    getRules: vi.fn().mockResolvedValue([]),
    getRuleById: vi.fn().mockResolvedValue(null),
    updateRule: vi.fn().mockResolvedValue(undefined),
    saveRuleVersion: vi.fn().mockResolvedValue(undefined),
    getRuleVersions: vi.fn().mockResolvedValue([]),
    saveSession: vi.fn().mockResolvedValue(undefined),
    getSessions: vi.fn().mockResolvedValue([]),
    getSessionById: vi.fn().mockResolvedValue(null),
    saveAlert: vi.fn().mockResolvedValue(undefined),
    getAlerts: vi.fn().mockResolvedValue([]),
    acknowledgeAlert: vi.fn().mockResolvedValue(undefined),
    saveConsolidatedRule: vi.fn().mockResolvedValue(undefined),
    getConsolidatedRules: vi.fn().mockResolvedValue([]),
    saveSnapshot: vi.fn().mockResolvedValue(undefined),
    getLatestSnapshot: vi.fn().mockResolvedValue(null),
  } as unknown as StorageAdapter;
}

function makeAlert(overrides: Partial<AgentAlert> = {}): AgentAlert {
  return {
    id: crypto.randomUUID(),
    type: 'QUALITY_DEGRADATION',
    message: 'Quality dropped',
    severity: 'MAJOR',
    createdAt: new Date().toISOString(),
    acknowledged: false,
    ...overrides,
  };
}

describe('emitNotifications', () => {
  let storage: StorageAdapter;
  beforeEach(() => {
    storage = createMockStorage();
    vi.clearAllMocks();
    mockExistsSync.mockReturnValue(false);
    mockReadFileSync.mockReturnValue('' as unknown as Buffer);
  });

  it('returns emitted=0 when no unacknowledged alerts', async () => {
    vi.mocked(storage.getAlerts).mockResolvedValue([]);
    const result = await emitNotifications(storage, '/cwd');
    expect(result.emitted).toBe(0);
    expect(result.filePath).toBe('');
    expect(mockWriteFileSync).not.toHaveBeenCalled();
  });

  it('writes notifications.md file when alerts exist', async () => {
    vi.mocked(storage.getAlerts).mockResolvedValue([makeAlert()]);
    const result = await emitNotifications(storage, '/cwd');
    expect(result.emitted).toBe(1);
    expect(result.filePath).toContain('notifications.md');
    expect(mockWriteFileSync).toHaveBeenCalledTimes(1);
  });

  it('acknowledges each emitted alert', async () => {
    const alert1 = makeAlert({ id: 'alert-1' });
    const alert2 = makeAlert({ id: 'alert-2' });
    vi.mocked(storage.getAlerts).mockResolvedValue([alert1, alert2]);
    await emitNotifications(storage, '/cwd');
    expect(storage.acknowledgeAlert).toHaveBeenCalledWith('alert-1');
    expect(storage.acknowledgeAlert).toHaveBeenCalledWith('alert-2');
    expect(storage.acknowledgeAlert).toHaveBeenCalledTimes(2);
  });

  it('appends to existing notifications file', async () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue('# Existing content\n' as unknown as Buffer);
    vi.mocked(storage.getAlerts).mockResolvedValue([makeAlert()]);
    await emitNotifications(storage, '/cwd');
    const content = mockWriteFileSync.mock.calls[0]?.[1] as string;
    expect(content).toContain('# Existing content');
    expect(content).toContain('QUALITY_DEGRADATION');
  });

  it('includes alert message in output', async () => {
    vi.mocked(storage.getAlerts).mockResolvedValue([makeAlert({ message: 'Critical quality drop' })]);
    await emitNotifications(storage, '/cwd');
    const content = mockWriteFileSync.mock.calls[0]?.[1] as string;
    expect(content).toContain('Critical quality drop');
  });

  it('includes alert severity in output', async () => {
    vi.mocked(storage.getAlerts).mockResolvedValue([makeAlert({ severity: 'CRITICAL' })]);
    await emitNotifications(storage, '/cwd');
    const content = mockWriteFileSync.mock.calls[0]?.[1] as string;
    expect(content).toContain('CRITICAL');
  });
});

