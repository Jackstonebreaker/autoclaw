import { describe, it, expect, beforeEach } from 'vitest';
import { SupabaseAdapter } from '../../storage/supabase-adapter.js';

const NOT_IMPLEMENTED = 'SupabaseAdapter is not yet implemented. Use "sqlite" or "file" storage.';

describe('SupabaseAdapter', () => {
  let adapter: SupabaseAdapter;

  beforeEach(() => {
    adapter = new SupabaseAdapter('https://example.supabase.co', 'fake-key');
  });

  it('constructs without throwing', () => {
    expect(() => new SupabaseAdapter('https://x.supabase.co', 'key')).not.toThrow();
  });

  it('initialize() throws NOT_IMPLEMENTED', async () => {
    await expect(adapter.initialize()).rejects.toThrow(NOT_IMPLEMENTED);
  });

  it('savePattern() throws NOT_IMPLEMENTED', async () => {
    await expect(adapter.savePattern({} as never)).rejects.toThrow(NOT_IMPLEMENTED);
  });

  it('getPatterns() throws NOT_IMPLEMENTED', async () => {
    await expect(adapter.getPatterns()).rejects.toThrow(NOT_IMPLEMENTED);
  });

  it('getPatternById() throws NOT_IMPLEMENTED', async () => {
    await expect(adapter.getPatternById('id')).rejects.toThrow(NOT_IMPLEMENTED);
  });

  it('updatePattern() throws NOT_IMPLEMENTED', async () => {
    await expect(adapter.updatePattern('id', {})).rejects.toThrow(NOT_IMPLEMENTED);
  });

  it('saveRule() throws NOT_IMPLEMENTED', async () => {
    await expect(adapter.saveRule({} as never)).rejects.toThrow(NOT_IMPLEMENTED);
  });

  it('getRules() throws NOT_IMPLEMENTED', async () => {
    await expect(adapter.getRules()).rejects.toThrow(NOT_IMPLEMENTED);
  });

  it('getRuleById() throws NOT_IMPLEMENTED', async () => {
    await expect(adapter.getRuleById('id')).rejects.toThrow(NOT_IMPLEMENTED);
  });

  it('updateRule() throws NOT_IMPLEMENTED', async () => {
    await expect(adapter.updateRule('id', {})).rejects.toThrow(NOT_IMPLEMENTED);
  });

  it('saveRuleVersion() throws NOT_IMPLEMENTED', async () => {
    await expect(adapter.saveRuleVersion({} as never)).rejects.toThrow(NOT_IMPLEMENTED);
  });

  it('getRuleVersions() throws NOT_IMPLEMENTED', async () => {
    await expect(adapter.getRuleVersions('id')).rejects.toThrow(NOT_IMPLEMENTED);
  });

  it('saveSession() throws NOT_IMPLEMENTED', async () => {
    await expect(adapter.saveSession({} as never)).rejects.toThrow(NOT_IMPLEMENTED);
  });

  it('getSessions() throws NOT_IMPLEMENTED', async () => {
    await expect(adapter.getSessions()).rejects.toThrow(NOT_IMPLEMENTED);
  });

  it('getSessionById() throws NOT_IMPLEMENTED', async () => {
    await expect(adapter.getSessionById('id')).rejects.toThrow(NOT_IMPLEMENTED);
  });

  it('saveAlert() throws NOT_IMPLEMENTED', async () => {
    await expect(adapter.saveAlert({} as never)).rejects.toThrow(NOT_IMPLEMENTED);
  });

  it('getAlerts() throws NOT_IMPLEMENTED', async () => {
    await expect(adapter.getAlerts()).rejects.toThrow(NOT_IMPLEMENTED);
  });

  it('acknowledgeAlert() throws NOT_IMPLEMENTED', async () => {
    await expect(adapter.acknowledgeAlert('id')).rejects.toThrow(NOT_IMPLEMENTED);
  });

  it('saveConsolidatedRule() throws NOT_IMPLEMENTED', async () => {
    await expect(adapter.saveConsolidatedRule({} as never)).rejects.toThrow(NOT_IMPLEMENTED);
  });

  it('getConsolidatedRules() throws NOT_IMPLEMENTED', async () => {
    await expect(adapter.getConsolidatedRules()).rejects.toThrow(NOT_IMPLEMENTED);
  });

  it('saveSnapshot() throws NOT_IMPLEMENTED', async () => {
    await expect(adapter.saveSnapshot({} as never)).rejects.toThrow(NOT_IMPLEMENTED);
  });

  it('getLatestSnapshot() throws NOT_IMPLEMENTED', async () => {
    await expect(adapter.getLatestSnapshot()).rejects.toThrow(NOT_IMPLEMENTED);
  });

  it('close() throws NOT_IMPLEMENTED', async () => {
    await expect(adapter.close()).rejects.toThrow(NOT_IMPLEMENTED);
  });
});

