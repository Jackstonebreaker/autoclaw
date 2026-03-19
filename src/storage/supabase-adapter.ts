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

const NOT_IMPLEMENTED = 'SupabaseAdapter is not yet implemented. Use "sqlite" or "file" storage.';

/**
 * Supabase StorageAdapter — stub implementation.
 * All methods throw until Supabase support is implemented.
 */
export class SupabaseAdapter implements StorageAdapter {
  constructor(_url: string, _key: string) {
    // Stub — Supabase support will be implemented in a future wave
  }

  async initialize(): Promise<void> { throw new Error(NOT_IMPLEMENTED); }

  async savePattern(_pattern: LearnedPattern): Promise<void> { throw new Error(NOT_IMPLEMENTED); }
  async getPatterns(_options?: { category?: string; minConfidence?: number }): Promise<LearnedPattern[]> { throw new Error(NOT_IMPLEMENTED); }
  async getPatternById(_id: string): Promise<LearnedPattern | null> { throw new Error(NOT_IMPLEMENTED); }
  async updatePattern(_id: string, _updates: Partial<LearnedPattern>): Promise<void> { throw new Error(NOT_IMPLEMENTED); }

  async saveRule(_rule: RuleSuggestion): Promise<void> { throw new Error(NOT_IMPLEMENTED); }
  async getRules(_options?: { status?: string; category?: string }): Promise<RuleSuggestion[]> { throw new Error(NOT_IMPLEMENTED); }
  async getRuleById(_id: string): Promise<RuleSuggestion | null> { throw new Error(NOT_IMPLEMENTED); }
  async updateRule(_id: string, _updates: Partial<RuleSuggestion>): Promise<void> { throw new Error(NOT_IMPLEMENTED); }

  async saveRuleVersion(_version: RuleVersion): Promise<void> { throw new Error(NOT_IMPLEMENTED); }
  async getRuleVersions(_ruleId: string): Promise<RuleVersion[]> { throw new Error(NOT_IMPLEMENTED); }

  async saveSession(_session: SessionRecord): Promise<void> { throw new Error(NOT_IMPLEMENTED); }
  async getSessions(_options?: { limit?: number; offset?: number }): Promise<SessionRecord[]> { throw new Error(NOT_IMPLEMENTED); }
  async getSessionById(_id: string): Promise<SessionRecord | null> { throw new Error(NOT_IMPLEMENTED); }

  async saveAlert(_alert: AgentAlert): Promise<void> { throw new Error(NOT_IMPLEMENTED); }
  async getAlerts(_options?: { type?: string; acknowledged?: boolean }): Promise<AgentAlert[]> { throw new Error(NOT_IMPLEMENTED); }
  async acknowledgeAlert(_id: string): Promise<void> { throw new Error(NOT_IMPLEMENTED); }

  async saveConsolidatedRule(_rule: ConsolidatedRule): Promise<void> { throw new Error(NOT_IMPLEMENTED); }
  async getConsolidatedRules(_options?: { minScore?: number }): Promise<ConsolidatedRule[]> { throw new Error(NOT_IMPLEMENTED); }

  async saveSnapshot(_snapshot: StarterKitSnapshot): Promise<void> { throw new Error(NOT_IMPLEMENTED); }
  async getLatestSnapshot(): Promise<StarterKitSnapshot | null> { throw new Error(NOT_IMPLEMENTED); }

  async close(): Promise<void> { throw new Error(NOT_IMPLEMENTED); }
}

