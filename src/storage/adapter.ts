import type {
  LearnedPattern,
  RuleSuggestion,
  SessionRecord,
  AgentAlert,
  RuleVersion,
  ConsolidatedRule,
  StarterKitSnapshot,
} from '../types.js';

/**
 * Abstract storage interface — implemented by SQLite, File, and Supabase adapters.
 * All adapters must implement this interface to be usable by the Orchestrator.
 */
export interface StorageAdapter {
  // === Initialization ===
  /** Initialize storage (create tables, directories, etc.) */
  initialize(): Promise<void>;

  // === Patterns ===
  savePattern(pattern: LearnedPattern): Promise<void>;
  getPatterns(options?: { category?: string; minConfidence?: number }): Promise<LearnedPattern[]>;
  getPatternById(id: string): Promise<LearnedPattern | null>;
  updatePattern(id: string, updates: Partial<LearnedPattern>): Promise<void>;

  // === Rules ===
  saveRule(rule: RuleSuggestion): Promise<void>;
  getRules(options?: { status?: string; category?: string }): Promise<RuleSuggestion[]>;
  getRuleById(id: string): Promise<RuleSuggestion | null>;
  updateRule(id: string, updates: Partial<RuleSuggestion>): Promise<void>;

  // === Rule Versions ===
  saveRuleVersion(version: RuleVersion): Promise<void>;
  getRuleVersions(ruleId: string): Promise<RuleVersion[]>;

  // === Sessions ===
  saveSession(session: SessionRecord): Promise<void>;
  getSessions(options?: { limit?: number; offset?: number }): Promise<SessionRecord[]>;
  getSessionById(id: string): Promise<SessionRecord | null>;

  // === Alerts ===
  saveAlert(alert: AgentAlert): Promise<void>;
  getAlerts(options?: { type?: string; acknowledged?: boolean }): Promise<AgentAlert[]>;
  acknowledgeAlert(id: string): Promise<void>;

  // === Consolidated Rules (W4) ===
  saveConsolidatedRule(rule: ConsolidatedRule): Promise<void>;
  getConsolidatedRules(options?: { minScore?: number }): Promise<ConsolidatedRule[]>;

  // === Starter Kit Snapshots (W5) ===
  saveSnapshot(snapshot: StarterKitSnapshot): Promise<void>;
  getLatestSnapshot(): Promise<StarterKitSnapshot | null>;

  // === Utility ===
  close(): Promise<void>;
}

