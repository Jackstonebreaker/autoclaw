/**
 * AutoClaw — public API re-exports
 * CLI entry point is at src/cli/index.ts
 */

export { loadConfig } from './config.js';
export { createStorage } from './storage/index.js';
export type { StorageAdapter } from './storage/index.js';
export { analyzeSession, gatherGitData } from './session-analyzer.js';
export type { AnalyzeSessionOptions } from './session-analyzer.js';
export { detectCrossSessionPatterns } from './pattern-detector.js';
export { generateRuleSuggestions } from './rule-suggester.js';
export { autoApproveHighConfidenceRules, applyAllPendingRules } from './rule-applier.js';
export { scoreSession, detectQualityDegradation } from './quality-scorer.js';
export { checkDocSync } from './doc-syncer.js';
export { runPipeline } from './orchestrator.js';
export type { PipelineResult } from './orchestrator.js';
export * from './types.js';

