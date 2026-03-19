import Database from 'better-sqlite3';
import { join } from 'path';
import { mkdirSync } from 'fs';
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

const DB_DIR = '.autoclaw';
const DB_FILE = 'autoclaw.db';

/**
 * SQLite-backed StorageAdapter using better-sqlite3.
 * All arrays and objects are JSON-serialized for storage.
 */
export class SQLiteAdapter implements StorageAdapter {
  private db!: Database.Database;
  private readonly dbPath: string;

  constructor(dbPath?: string) {
    this.dbPath = dbPath ?? join(process.cwd(), DB_DIR, DB_FILE);
  }

  async initialize(): Promise<void> {
    mkdirSync(join(process.cwd(), DB_DIR), { recursive: true });
    this.db = new Database(this.dbPath);
    this.db.pragma('journal_mode = WAL');
    this.createTables();
  }

  private createTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS patterns (
        id TEXT PRIMARY KEY,
        description TEXT NOT NULL,
        category TEXT NOT NULL,
        frequency INTEGER NOT NULL,
        confidence REAL NOT NULL,
        examples TEXT NOT NULL,
        firstSeen TEXT NOT NULL,
        lastSeen TEXT NOT NULL,
        sessionIds TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS rules (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        category TEXT NOT NULL,
        severity TEXT NOT NULL,
        confidence REAL NOT NULL,
        status TEXT NOT NULL,
        sourcePatterns TEXT NOT NULL,
        targetFiles TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        appliedAt TEXT
      );
      CREATE TABLE IF NOT EXISTS rule_versions (
        ruleId TEXT NOT NULL,
        version INTEGER NOT NULL,
        content TEXT NOT NULL,
        diff TEXT,
        createdAt TEXT NOT NULL,
        PRIMARY KEY (ruleId, version)
      );
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        analyzedAt TEXT NOT NULL,
        commitRange TEXT NOT NULL,
        patternsFound INTEGER NOT NULL,
        qualityScore REAL NOT NULL,
        summary TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS alerts (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        message TEXT NOT NULL,
        severity TEXT NOT NULL,
        data TEXT,
        createdAt TEXT NOT NULL,
        acknowledged INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS consolidated_rules (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        classification TEXT NOT NULL,
        sourceRules TEXT NOT NULL,
        universalScore REAL NOT NULL,
        createdAt TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        version TEXT NOT NULL,
        capturedAt TEXT NOT NULL,
        starterKitPath TEXT NOT NULL,
        files TEXT NOT NULL,
        totalFiles INTEGER NOT NULL
      );
    `);
  }

  // === Patterns ===

  async savePattern(pattern: LearnedPattern): Promise<void> {
    this.db.prepare(`
      INSERT OR REPLACE INTO patterns VALUES (?,?,?,?,?,?,?,?,?)
    `).run(
      pattern.id, pattern.description, pattern.category,
      pattern.frequency, pattern.confidence,
      JSON.stringify(pattern.examples),
      pattern.firstSeen, pattern.lastSeen,
      JSON.stringify(pattern.sessionIds),
    );
  }

  async getPatterns(options?: { category?: string; minConfidence?: number }): Promise<LearnedPattern[]> {
    let sql = 'SELECT * FROM patterns WHERE 1=1';
    const params: (string | number)[] = [];
    if (options?.category) { sql += ' AND category = ?'; params.push(options.category); }
    if (options?.minConfidence !== undefined) { sql += ' AND confidence >= ?'; params.push(options.minConfidence); }
    const rows = this.db.prepare(sql).all(...params) as Record<string, unknown>[];
    return rows.map(r => this.rowToPattern(r));
  }

  async getPatternById(id: string): Promise<LearnedPattern | null> {
    const row = this.db.prepare('SELECT * FROM patterns WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    return row ? this.rowToPattern(row) : null;
  }

  async updatePattern(id: string, updates: Partial<LearnedPattern>): Promise<void> {
    const existing = await this.getPatternById(id);
    if (!existing) throw new Error(`Pattern not found: ${id}`);
    await this.savePattern({ ...existing, ...updates });
  }

  private rowToPattern(row: Record<string, unknown>): LearnedPattern {
    return {
      id: row['id'] as string,
      description: row['description'] as string,
      category: row['category'] as LearnedPattern['category'],
      frequency: row['frequency'] as number,
      confidence: row['confidence'] as number,
      examples: JSON.parse(row['examples'] as string) as string[],
      firstSeen: row['firstSeen'] as string,
      lastSeen: row['lastSeen'] as string,
      sessionIds: JSON.parse(row['sessionIds'] as string) as string[],
    };
  }

  // === Rules ===

  async saveRule(rule: RuleSuggestion): Promise<void> {
    this.db.prepare(`
      INSERT OR REPLACE INTO rules VALUES (?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      rule.id, rule.title, rule.content, rule.category, rule.severity,
      rule.confidence, rule.status,
      JSON.stringify(rule.sourcePatterns),
      JSON.stringify(rule.targetFiles),
      rule.createdAt, rule.appliedAt ?? null,
    );
  }

  async getRules(options?: { status?: string; category?: string }): Promise<RuleSuggestion[]> {
    let sql = 'SELECT * FROM rules WHERE 1=1';
    const params: string[] = [];
    if (options?.status) { sql += ' AND status = ?'; params.push(options.status); }
    if (options?.category) { sql += ' AND category = ?'; params.push(options.category); }
    const rows = this.db.prepare(sql).all(...params) as Record<string, unknown>[];
    return rows.map(r => this.rowToRule(r));
  }

  async getRuleById(id: string): Promise<RuleSuggestion | null> {
    const row = this.db.prepare('SELECT * FROM rules WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    return row ? this.rowToRule(row) : null;
  }

  async updateRule(id: string, updates: Partial<RuleSuggestion>): Promise<void> {
    const existing = await this.getRuleById(id);
    if (!existing) throw new Error(`Rule not found: ${id}`);
    await this.saveRule({ ...existing, ...updates });
  }

  private rowToRule(row: Record<string, unknown>): RuleSuggestion {
    return {
      id: row['id'] as string,
      title: row['title'] as string,
      content: row['content'] as string,
      category: row['category'] as RuleSuggestion['category'],
      severity: row['severity'] as RuleSuggestion['severity'],
      confidence: row['confidence'] as number,
      status: row['status'] as RuleSuggestion['status'],
      sourcePatterns: JSON.parse(row['sourcePatterns'] as string) as string[],
      targetFiles: JSON.parse(row['targetFiles'] as string) as string[],
      createdAt: row['createdAt'] as string,
      appliedAt: row['appliedAt'] as string | undefined,
    };
  }

  // === Rule Versions ===

  async saveRuleVersion(version: RuleVersion): Promise<void> {
    this.db.prepare(`
      INSERT OR REPLACE INTO rule_versions VALUES (?,?,?,?,?)
    `).run(version.ruleId, version.version, version.content, version.diff ?? null, version.createdAt);
  }

  async getRuleVersions(ruleId: string): Promise<RuleVersion[]> {
    const rows = this.db.prepare('SELECT * FROM rule_versions WHERE ruleId = ? ORDER BY version ASC').all(ruleId) as Record<string, unknown>[];
    return rows.map(row => ({
      ruleId: row['ruleId'] as string,
      version: row['version'] as number,
      content: row['content'] as string,
      diff: row['diff'] as string | undefined,
      createdAt: row['createdAt'] as string,
    }));
  }

  // === Sessions ===

  async saveSession(session: SessionRecord): Promise<void> {
    this.db.prepare(`
      INSERT OR REPLACE INTO sessions VALUES (?,?,?,?,?,?)
    `).run(session.id, session.analyzedAt, session.commitRange, session.patternsFound, session.qualityScore, session.summary);
  }

  async getSessions(options?: { limit?: number; offset?: number }): Promise<SessionRecord[]> {
    const limit = options?.limit ?? 100;
    const offset = options?.offset ?? 0;
    const rows = this.db.prepare('SELECT * FROM sessions ORDER BY analyzedAt DESC LIMIT ? OFFSET ?').all(limit, offset) as Record<string, unknown>[];
    return rows.map(row => ({
      id: row['id'] as string,
      analyzedAt: row['analyzedAt'] as string,
      commitRange: row['commitRange'] as string,
      patternsFound: row['patternsFound'] as number,
      qualityScore: row['qualityScore'] as number,
      summary: row['summary'] as string,
    }));
  }

  async getSessionById(id: string): Promise<SessionRecord | null> {
    const row = this.db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    if (!row) return null;
    return {
      id: row['id'] as string,
      analyzedAt: row['analyzedAt'] as string,
      commitRange: row['commitRange'] as string,
      patternsFound: row['patternsFound'] as number,
      qualityScore: row['qualityScore'] as number,
      summary: row['summary'] as string,
    };
  }

  // === Alerts ===

  async saveAlert(alert: AgentAlert): Promise<void> {
    this.db.prepare(`
      INSERT OR REPLACE INTO alerts VALUES (?,?,?,?,?,?,?)
    `).run(
      alert.id, alert.type, alert.message, alert.severity,
      alert.data ? JSON.stringify(alert.data) : null,
      alert.createdAt, alert.acknowledged ? 1 : 0,
    );
  }

  async getAlerts(options?: { type?: string; acknowledged?: boolean }): Promise<AgentAlert[]> {
    let sql = 'SELECT * FROM alerts WHERE 1=1';
    const params: (string | number)[] = [];
    if (options?.type) { sql += ' AND type = ?'; params.push(options.type); }
    if (options?.acknowledged !== undefined) { sql += ' AND acknowledged = ?'; params.push(options.acknowledged ? 1 : 0); }
    const rows = this.db.prepare(sql).all(...params) as Record<string, unknown>[];
    return rows.map(row => ({
      id: row['id'] as string,
      type: row['type'] as AgentAlert['type'],
      message: row['message'] as string,
      severity: row['severity'] as AgentAlert['severity'],
      data: row['data'] ? JSON.parse(row['data'] as string) as Record<string, unknown> : undefined,
      createdAt: row['createdAt'] as string,
      acknowledged: Boolean(row['acknowledged']),
    }));
  }

  async acknowledgeAlert(id: string): Promise<void> {
    this.db.prepare('UPDATE alerts SET acknowledged = 1 WHERE id = ?').run(id);
  }

  // === Consolidated Rules ===

  async saveConsolidatedRule(rule: ConsolidatedRule): Promise<void> {
    this.db.prepare(`
      INSERT OR REPLACE INTO consolidated_rules VALUES (?,?,?,?,?,?,?)
    `).run(
      rule.id, rule.title, rule.content,
      JSON.stringify(rule.classification),
      JSON.stringify(rule.sourceRules),
      rule.universalScore, rule.createdAt,
    );
  }

  async getConsolidatedRules(options?: { minScore?: number }): Promise<ConsolidatedRule[]> {
    let sql = 'SELECT * FROM consolidated_rules WHERE 1=1';
    const params: number[] = [];
    if (options?.minScore !== undefined) { sql += ' AND universalScore >= ?'; params.push(options.minScore); }
    const rows = this.db.prepare(sql).all(...params) as Record<string, unknown>[];
    return rows.map(row => ({
      id: row['id'] as string,
      title: row['title'] as string,
      content: row['content'] as string,
      classification: JSON.parse(row['classification'] as string) as ConsolidatedRule['classification'],
      sourceRules: JSON.parse(row['sourceRules'] as string) as string[],
      universalScore: row['universalScore'] as number,
      createdAt: row['createdAt'] as string,
    }));
  }

  // === Snapshots ===

  async saveSnapshot(snapshot: StarterKitSnapshot): Promise<void> {
    this.db.prepare(`
      INSERT INTO snapshots (version, capturedAt, starterKitPath, files, totalFiles) VALUES (?,?,?,?,?)
    `).run(snapshot.version, snapshot.capturedAt, snapshot.starterKitPath, JSON.stringify(snapshot.files), snapshot.totalFiles);
  }

  async getLatestSnapshot(): Promise<StarterKitSnapshot | null> {
    const row = this.db.prepare('SELECT * FROM snapshots ORDER BY id DESC LIMIT 1').get() as Record<string, unknown> | undefined;
    if (!row) return null;
    return {
      version: row['version'] as string,
      capturedAt: row['capturedAt'] as string,
      starterKitPath: row['starterKitPath'] as string,
      files: JSON.parse(row['files'] as string) as StarterKitSnapshot['files'],
      totalFiles: row['totalFiles'] as number,
    };
  }

  // === Utility ===

  async close(): Promise<void> {
    this.db.close();
  }
}
