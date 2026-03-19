import { execSync } from 'node:child_process';
import { callClaude, MODELS } from './ai/index.js';
import { SimpleQueue } from './ai/queue.js';
import { createLogger } from './logger.js';
import type { StorageAdapter } from './storage/adapter.js';
import type { SessionAnalysis, SessionPattern } from './types.js';
import { SessionAnalysisSchema } from './types.js';

const logger = createLogger('session-analyzer');
const queue = new SimpleQueue();

export interface AnalyzeSessionOptions {
  cwd?: string;
  since?: string;
  dryRun?: boolean;
}

/**
 * Gather git data (commits, diffs) from the repo
 */
export function gatherGitData(options: AnalyzeSessionOptions): {
  commits: string;
  diff: string;
  commitCount: number;
  filesChanged: number;
} {
  const cwd = options.cwd ?? process.cwd();
  const since = options.since ?? '7 days ago';

  const commits = execSync(`git log --oneline --since="${since}"`, { cwd, encoding: 'utf-8' }).trim();
  const diff = execSync(`git log --since="${since}" --stat`, { cwd, encoding: 'utf-8' }).trim();

  const commitCount = commits ? commits.split('\n').length : 0;
  const filesChanged = new Set(
    diff.match(/\s+\S+\s+\|\s+[0-9]+/g)?.map(m => m.trim().split(/\s+/)[0]) ?? []
  ).size;

  return { commits, diff, commitCount, filesChanged };
}

/**
 * Call Claude to analyze the git data and extract patterns
 */
export async function callClaudeForAnalysis(gitData: {
  commits: string;
  diff: string;
}): Promise<SessionPattern[]> {
  const prompt = `Analyze these git commits and identify coding patterns (errors, improvements, recurring issues).

COMMITS:
${gitData.commits}

DIFF STATS:
${gitData.diff}

Return a JSON array of patterns. Each pattern has:
- description: string (what the pattern is)
- category: one of TYPE_ERROR, IMPORT_ERROR, LOGIC_ERROR, STYLE_VIOLATION, PERFORMANCE, SECURITY, TESTING, ARCHITECTURE, NAMING, ERROR_HANDLING, DOCUMENTATION, DEPENDENCY, OTHER
- frequency: number (how many times it appears)
- confidence: number 0-1 (how confident you are)
- examples: string[] (specific examples from the commits)

Return ONLY the JSON array, no markdown.`;

  const result = await queue.add(() =>
    callClaude({
      prompt,
      model: MODELS.HAIKU,
      systemPrompt: 'You are a code analysis expert. Return only valid JSON.',
      temperature: 0,
    })
  );

  try {
    const parsed: unknown = JSON.parse(result.content);
    return Array.isArray(parsed) ? (parsed as SessionPattern[]) : [];
  } catch {
    logger.warn('Failed to parse Claude response as JSON');
    return [];
  }
}

/**
 * Full session analysis pipeline
 */
export async function analyzeSession(
  storage: StorageAdapter,
  options: AnalyzeSessionOptions = {}
): Promise<SessionAnalysis> {
  logger.info('Starting session analysis', { since: options.since ?? '7 days ago' });

  const gitData = gatherGitData(options);

  if (gitData.commitCount === 0) {
    logger.info('No commits found in the specified period');
    const emptyAnalysis: SessionAnalysis = {
      sessionId: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      patterns: [],
      quality: { errorRate: 0, patternDiversity: 0, improvementTrend: 0, topCategories: [] },
      commitCount: 0,
      filesChanged: 0,
    };
    return emptyAnalysis;
  }

  let patterns: SessionPattern[] = [];
  if (!options.dryRun) {
    patterns = await callClaudeForAnalysis(gitData);
    const now = new Date().toISOString();
    patterns = patterns.map(p => ({
      ...p,
      firstSeen: p.firstSeen ?? now,
      lastSeen: p.lastSeen ?? now,
    }));
  }

  const analysis: SessionAnalysis = SessionAnalysisSchema.parse({
    sessionId: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    patterns,
    quality: {
      errorRate: patterns.length > 0
        ? patterns.filter(p => p.confidence > 0.7).length / patterns.length
        : 0,
      patternDiversity: new Set(patterns.map(p => p.category)).size,
      improvementTrend: 0,
      topCategories: [...new Set(patterns.map(p => p.category))].slice(0, 5),
    },
    commitCount: gitData.commitCount,
    filesChanged: gitData.filesChanged,
  });

  if (!options.dryRun) {
    await storage.saveSession({
      id: analysis.sessionId,
      analyzedAt: analysis.timestamp,
      commitRange: options.since ?? '7 days ago',
      patternsFound: analysis.patterns.length,
      qualityScore: 1 - analysis.quality.errorRate,
      summary: `Analyzed ${analysis.commitCount} commits, found ${analysis.patterns.length} patterns`,
    });
  }

  logger.info(`Analysis complete: ${patterns.length} patterns found`);
  return analysis;
}

