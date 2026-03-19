import { z } from 'zod';

// ============ ENUMS ============

export const CodingCategorySchema = z.enum([
  'TYPE_ERROR', 'IMPORT_ERROR', 'LOGIC_ERROR', 'STYLE_VIOLATION',
  'PERFORMANCE', 'SECURITY', 'TESTING', 'ARCHITECTURE', 'NAMING',
  'ERROR_HANDLING', 'DOCUMENTATION', 'DEPENDENCY', 'OTHER'
]);
export type CodingCategory = z.infer<typeof CodingCategorySchema>;

export const RuleStatusSchema = z.enum(['PENDING', 'APPROVED', 'APPLIED', 'REJECTED', 'SUPERSEDED']);
export type RuleStatus = z.infer<typeof RuleStatusSchema>;

export const RuleSeveritySchema = z.enum(['CRITICAL', 'MAJOR', 'MINOR', 'INFO']);
export type RuleSeverity = z.infer<typeof RuleSeveritySchema>;

export const AlertTypeSchema = z.enum(['QUALITY_DEGRADATION', 'NEW_PATTERN', 'RULE_APPLIED', 'DOC_DESYNC', 'LINEAR_SYNC']);
export type AlertType = z.infer<typeof AlertTypeSchema>;

// ============ CORE TYPES ============

export const SessionPatternSchema = z.object({
  description: z.string(),
  category: CodingCategorySchema,
  frequency: z.number().min(1),
  confidence: z.number().min(0).max(1),
  examples: z.array(z.string()),
  firstSeen: z.string().datetime(),
  lastSeen: z.string().datetime(),
});
export type SessionPattern = z.infer<typeof SessionPatternSchema>;

export const QualityIndicatorSchema = z.object({
  errorRate: z.number().min(0).max(1),
  patternDiversity: z.number().min(0),
  improvementTrend: z.number(),
  topCategories: z.array(CodingCategorySchema),
});
export type QualityIndicator = z.infer<typeof QualityIndicatorSchema>;

export const SessionAnalysisSchema = z.object({
  sessionId: z.string(),
  timestamp: z.string().datetime(),
  patterns: z.array(SessionPatternSchema),
  quality: QualityIndicatorSchema,
  commitCount: z.number(),
  filesChanged: z.number(),
});
export type SessionAnalysis = z.infer<typeof SessionAnalysisSchema>;

export const PatternDetectionResultSchema = z.object({
  newPatterns: z.array(SessionPatternSchema),
  recurringPatterns: z.array(SessionPatternSchema),
  crossSessionMatches: z.array(z.object({
    pattern: SessionPatternSchema,
    matchedSessionIds: z.array(z.string()),
    jaccardSimilarity: z.number().min(0).max(1),
  })),
});
export type PatternDetectionResult = z.infer<typeof PatternDetectionResultSchema>;

// ============ RULE TYPES ============

export const RuleSuggestionSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  content: z.string(),
  category: CodingCategorySchema,
  severity: RuleSeveritySchema,
  confidence: z.number().min(0).max(1),
  status: RuleStatusSchema,
  sourcePatterns: z.array(z.string()),
  targetFiles: z.array(z.string()),
  createdAt: z.string().datetime(),
  appliedAt: z.string().datetime().optional(),
});
export type RuleSuggestion = z.infer<typeof RuleSuggestionSchema>;

export const RuleVersionSchema = z.object({
  ruleId: z.string().uuid(),
  version: z.number().int().min(1),
  content: z.string(),
  diff: z.string().optional(),
  createdAt: z.string().datetime(),
});
export type RuleVersion = z.infer<typeof RuleVersionSchema>;


// ============ DB-LIKE RECORDS ============

export const LearnedPatternSchema = z.object({
  id: z.string().uuid(),
  description: z.string(),
  category: CodingCategorySchema,
  frequency: z.number().min(1),
  confidence: z.number().min(0).max(1),
  examples: z.array(z.string()),
  firstSeen: z.string().datetime(),
  lastSeen: z.string().datetime(),
  sessionIds: z.array(z.string()),
});
export type LearnedPattern = z.infer<typeof LearnedPatternSchema>;

export const SessionRecordSchema = z.object({
  id: z.string().uuid(),
  analyzedAt: z.string().datetime(),
  commitRange: z.string(),
  patternsFound: z.number(),
  qualityScore: z.number().min(0).max(1),
  summary: z.string(),
});
export type SessionRecord = z.infer<typeof SessionRecordSchema>;

export const AgentAlertSchema = z.object({
  id: z.string().uuid(),
  type: AlertTypeSchema,
  message: z.string(),
  severity: RuleSeveritySchema,
  data: z.record(z.string(), z.unknown()).optional(),
  createdAt: z.string().datetime(),
  acknowledged: z.boolean().default(false),
});
export type AgentAlert = z.infer<typeof AgentAlertSchema>;

// ============ QUALITY TYPES ============

export const QualityResultSchema = z.object({
  sessionId: z.string(),
  score: z.number().min(0).max(1),
  rolling5Avg: z.number().min(0).max(1),
  baseline20: z.number().min(0).max(1),
  trend: z.enum(['IMPROVING', 'STABLE', 'DEGRADING']),
});
export type QualityResult = z.infer<typeof QualityResultSchema>;

export const DegradationResultSchema = z.object({
  detected: z.boolean(),
  currentScore: z.number(),
  baselineScore: z.number(),
  delta: z.number(),
  alert: AgentAlertSchema.optional(),
});
export type DegradationResult = z.infer<typeof DegradationResultSchema>;

// ============ RULES AUDIT TYPES (W4) ============

export const RuleClassificationSchema = z.object({
  category: CodingCategorySchema,
  severity: RuleSeveritySchema,
  targetIDE: z.enum(['claude', 'augment', 'cursor', 'universal']),
  isProjectSpecific: z.boolean(),
  universalScore: z.number().min(0).max(1),
});
export type RuleClassification = z.infer<typeof RuleClassificationSchema>;

export const RawRuleSchema = z.object({
  filePath: z.string(),
  fileName: z.string(),
  content: z.string(),
  /** Directory the rule was read from (e.g. '.claude/rules'). Always set by rules-reader. */
  sourceDir: z.string(),
  /** SHA-256 of content — populated when rules come from a remote source. */
  checksum: z.string().optional(),
  /** Repo the rule originated from — populated for multi-repo scenarios. */
  sourceRepo: z.string().optional(),
});
export type RawRule = z.infer<typeof RawRuleSchema>;

// ============ CLASSIFIER TYPES (W4 — single source of truth) ============

export type RuleCategory =
  | 'security' | 'testing' | 'api-routes' | 'typescript' | 'agents'
  | 'git' | 'error-handling' | 'performance' | 'prisma'
  | 'coderabbit' | 'sonarqube' | 'trivy' | 'other';

export type RuleTarget = 'universal' | 'nextjs-only' | 'agents-only' | 'prisma-only';

/** Severity levels used by the rules classifier (distinct from RuleSeverity used in storage). */
export type ClassifierSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM';

export interface ClassifiedRule {
  filePath: string;
  fileName: string;
  /** Directory the rule was sourced from (e.g. '.claude/rules'). */
  sourceDir: string;
  content: string;
  category: RuleCategory;
  target: RuleTarget;
  severity: ClassifierSeverity;
  summary: string;
  keyPatterns: string[];
  overlaps: { ruleFile: string; similarity: number }[];
}

export const ConsolidatedRuleSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  content: z.string(),
  classification: RuleClassificationSchema,
  sourceRules: z.array(z.string()),
  universalScore: z.number().min(0).max(1),
  createdAt: z.string().datetime(),
});
export type ConsolidatedRule = z.infer<typeof ConsolidatedRuleSchema>;

// ============ STARTER KIT TYPES (W5) ============

export const StarterKitFileSchema = z.object({
  relativePath: z.string(),
  checksum: z.string(),
  size: z.number(),
  category: z.enum(['rule', 'command', 'config', 'doc']),
});
export type StarterKitFile = z.infer<typeof StarterKitFileSchema>;

export const StarterKitSnapshotSchema = z.object({
  version: z.string(),
  capturedAt: z.string().datetime(),
  starterKitPath: z.string(),
  files: z.array(StarterKitFileSchema),
  totalFiles: z.number(),
});
export type StarterKitSnapshot = z.infer<typeof StarterKitSnapshotSchema>;

export const StarterKitConfigSchema = z.object({
  starterKitPath: z.string(),
  starterKitVersion: z.string(),
  syncRules: z.boolean().default(true),
  syncCommands: z.boolean().default(true),
  syncHooks: z.boolean().default(true),
  customRules: z.array(z.string()).default([]),
});
export type StarterKitConfig = z.infer<typeof StarterKitConfigSchema>;

// ============ CONFIG ============

export const AutoClawConfigSchema = z.object({
  version: z.string().default('1.0.0'),
  storage: z.enum(['sqlite', 'file', 'supabase']).default('file'),
  autoApproveThreshold: z.number().min(0).max(1).default(0.70),
  suggestionThreshold: z.number().min(0).max(1).default(0.70),
  targetDirs: z.array(z.string()).default(['.claude/rules', '.augment/rules', '.cursor/rules']),
  supabaseUrl: z.string().url().optional(),
  supabaseKey: z.string().min(1).optional(),
  linearApiKey: z.string().min(1).optional(),
  starterKit: StarterKitConfigSchema.optional(),
});
export type AutoClawConfig = z.infer<typeof AutoClawConfigSchema>;

