import { join } from 'path';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'fs';
import type { StorageAdapter } from './adapter.js';
import type {
  LearnedPattern,
  RuleSuggestion,
  SessionRecord,
  AgentAlert,
  RuleVersion,
  ConsolidatedRule,
  StarterKitSnapshot,
} from '../types.js';

const DATA_DIR = join('.autoclaw', 'data');

type Collections = {
  patterns: LearnedPattern[];
  rules: RuleSuggestion[];
  'rule-versions': RuleVersion[];
  sessions: SessionRecord[];
  alerts: AgentAlert[];
  'consolidated-rules': ConsolidatedRule[];
  snapshots: StarterKitSnapshot[];
};

type CollectionKey = keyof Collections;

/**
 * File-based StorageAdapter. Each collection is stored as a JSON file
 * in `.autoclaw/data/`. No concurrency support — single-process use only.
 */
export class FileAdapter implements StorageAdapter {
  private readonly dataDir: string;

  constructor(dataDir?: string) {
    this.dataDir = dataDir ?? join(process.cwd(), DATA_DIR);
  }

  async initialize(): Promise<void> {
    mkdirSync(this.dataDir, { recursive: true });
    const files: CollectionKey[] = ['patterns', 'rules', 'rule-versions', 'sessions', 'alerts', 'consolidated-rules', 'snapshots'];
    for (const file of files) {
      const path = this.filePath(file);
      if (!existsSync(path)) {
        writeFileSync(path, '[]', 'utf-8');
      }
    }
  }

  private filePath(collection: CollectionKey): string {
    return join(this.dataDir, `${collection}.json`);
  }

  private read<K extends CollectionKey>(collection: K): Collections[K] {
    const raw = readFileSync(this.filePath(collection), 'utf-8');
    return JSON.parse(raw) as Collections[K];
  }

  private write<K extends CollectionKey>(collection: K, data: Collections[K]): void {
    writeFileSync(this.filePath(collection), JSON.stringify(data, null, 2), 'utf-8');
  }

  // === Patterns ===

  async savePattern(pattern: LearnedPattern): Promise<void> {
    const all = this.read('patterns');
    const idx = all.findIndex(p => p.id === pattern.id);
    if (idx >= 0) { all[idx] = pattern; } else { all.push(pattern); }
    this.write('patterns', all);
  }

  async getPatterns(options?: { category?: string; minConfidence?: number }): Promise<LearnedPattern[]> {
    let all = this.read('patterns');
    if (options?.category) all = all.filter(p => p.category === options.category);
    if (options?.minConfidence !== undefined) all = all.filter(p => p.confidence >= options.minConfidence!);
    return all;
  }

  async getPatternById(id: string): Promise<LearnedPattern | null> {
    return this.read('patterns').find(p => p.id === id) ?? null;
  }

  async updatePattern(id: string, updates: Partial<LearnedPattern>): Promise<void> {
    const existing = await this.getPatternById(id);
    if (!existing) throw new Error(`Pattern not found: ${id}`);
    await this.savePattern({ ...existing, ...updates });
  }

  // === Rules ===

  async saveRule(rule: RuleSuggestion): Promise<void> {
    const all = this.read('rules');
    const idx = all.findIndex(r => r.id === rule.id);
    if (idx >= 0) { all[idx] = rule; } else { all.push(rule); }
    this.write('rules', all);
  }

  async getRules(options?: { status?: string; category?: string }): Promise<RuleSuggestion[]> {
    let all = this.read('rules');
    if (options?.status) all = all.filter(r => r.status === options.status);
    if (options?.category) all = all.filter(r => r.category === options.category);
    return all;
  }

  async getRuleById(id: string): Promise<RuleSuggestion | null> {
    return this.read('rules').find(r => r.id === id) ?? null;
  }

  async updateRule(id: string, updates: Partial<RuleSuggestion>): Promise<void> {
    const existing = await this.getRuleById(id);
    if (!existing) throw new Error(`Rule not found: ${id}`);
    await this.saveRule({ ...existing, ...updates });
  }

  // === Rule Versions ===

  async saveRuleVersion(version: RuleVersion): Promise<void> {
    const all = this.read('rule-versions');
    const idx = all.findIndex(v => v.ruleId === version.ruleId && v.version === version.version);
    if (idx >= 0) { all[idx] = version; } else { all.push(version); }
    this.write('rule-versions', all);
  }

  async getRuleVersions(ruleId: string): Promise<RuleVersion[]> {
    return this.read('rule-versions')
      .filter(v => v.ruleId === ruleId)
      .sort((a, b) => a.version - b.version);
  }



  // === Sessions ===

  async saveSession(session: SessionRecord): Promise<void> {
    const all = this.read('sessions');
    const idx = all.findIndex(s => s.id === session.id);
    if (idx >= 0) { all[idx] = session; } else { all.push(session); }
    this.write('sessions', all);
  }

  async getSessions(options?: { limit?: number; offset?: number }): Promise<SessionRecord[]> {
    const all = this.read('sessions').sort((a, b) => b.analyzedAt.localeCompare(a.analyzedAt));
    const offset = options?.offset ?? 0;
    const limit = options?.limit ?? 100;
    return all.slice(offset, offset + limit);
  }

  async getSessionById(id: string): Promise<SessionRecord | null> {
    return this.read('sessions').find(s => s.id === id) ?? null;
  }

  // === Alerts ===

  async saveAlert(alert: AgentAlert): Promise<void> {
    const all = this.read('alerts');
    const idx = all.findIndex(a => a.id === alert.id);
    if (idx >= 0) { all[idx] = alert; } else { all.push(alert); }
    this.write('alerts', all);
  }

  async getAlerts(options?: { type?: string; acknowledged?: boolean }): Promise<AgentAlert[]> {
    let all = this.read('alerts');
    if (options?.type) all = all.filter(a => a.type === options.type);
    if (options?.acknowledged !== undefined) all = all.filter(a => a.acknowledged === options.acknowledged);
    return all;
  }

  async acknowledgeAlert(id: string): Promise<void> {
    const all = this.read('alerts');
    const alert = all.find(a => a.id === id);
    if (!alert) throw new Error(`Alert not found: ${id}`);
    alert.acknowledged = true;
    this.write('alerts', all);
  }

  // === Consolidated Rules ===

  async saveConsolidatedRule(rule: ConsolidatedRule): Promise<void> {
    const all = this.read('consolidated-rules');
    const idx = all.findIndex(r => r.id === rule.id);
    if (idx >= 0) { all[idx] = rule; } else { all.push(rule); }
    this.write('consolidated-rules', all);
  }

  async getConsolidatedRules(options?: { minScore?: number }): Promise<ConsolidatedRule[]> {
    let all = this.read('consolidated-rules');
    if (options?.minScore !== undefined) all = all.filter(r => r.universalScore >= options.minScore!);
    return all;
  }

  // === Snapshots ===

  async saveSnapshot(snapshot: StarterKitSnapshot): Promise<void> {
    const all = this.read('snapshots');
    all.push(snapshot);
    this.write('snapshots', all);
  }

  async getLatestSnapshot(): Promise<StarterKitSnapshot | null> {
    const all = this.read('snapshots');
    if (all.length === 0) return null;
    return all[all.length - 1] ?? null;
  }

  // === Utility ===

  async close(): Promise<void> {
    // No-op for file adapter
  }
}
