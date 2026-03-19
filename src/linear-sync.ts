import { createLogger } from './logger.js';
import type { StorageAdapter } from './storage/adapter.js';

const logger = createLogger('linear-sync');

export interface LinearSyncResult {
  enabled: boolean;
  ticketsFetched: number;
  patternsEnriched: number;
  skippedReason?: string;
}

export interface LinearTicket {
  id: string;
  identifier: string;  // e.g. "ACW-123"
  title: string;
  labels: string[];
  completedAt: string;
}

type TicketCategory = 'security' | 'bug' | 'debt' | 'test' | 'docs' | 'general';

/**
 * Extract ticket IDs from commit messages
 * Matches patterns like FOR-123, ACW-45, BUG-1
 */
export function extractTicketIds(commits: string): string[] {
  const regex = /\b([A-Z]{2,8}-\d+)\b/g;
  const matches = commits.match(regex) ?? [];
  return [...new Set(matches)];
}

/**
 * Map Linear labels to a category with priority ordering
 * security > bug/fix > debt/refactor > test > docs > general
 */
export function mapLabelToCategory(labels: string[]): TicketCategory {
  const lower = labels.map(l => l.toLowerCase());

  if (lower.some(l => l.includes('security'))) return 'security';
  if (lower.some(l => l.includes('bug') || l.includes('fix'))) return 'bug';
  if (lower.some(l => l.includes('debt') || l.includes('refactor'))) return 'debt';
  if (lower.some(l => l.includes('test'))) return 'test';
  if (lower.some(l => l.includes('doc'))) return 'docs';
  return 'general';
}

/**
 * Fetch completed tickets from Linear GraphQL API
 */
export async function fetchClosedTickets(apiKey: string): Promise<LinearTicket[]> {
  const query = `
    query {
      issues(filter: { state: { type: { eq: "completed" } } }, first: 50, orderBy: completedAt) {
        nodes {
          id
          identifier
          title
          labels { nodes { name } }
          completedAt
        }
      }
    }
  `;

  const response = await fetch('https://api.linear.app/graphql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': apiKey,
    },
    body: JSON.stringify({ query }),
  });

  if (!response.ok) {
    throw new Error(`Linear API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json() as {
    data?: {
      issues?: {
        nodes?: Array<{
          id: string;
          identifier: string;
          title: string;
          labels?: { nodes?: Array<{ name: string }> };
          completedAt: string;
        }>;
      };
    };
  };

  const nodes = data?.data?.issues?.nodes ?? [];

  return nodes.map(node => ({
    id: node.id,
    identifier: node.identifier,
    title: node.title,
    labels: node.labels?.nodes?.map(l => l.name) ?? [],
    completedAt: node.completedAt,
  }));
}

/**
 * Enrich patterns with Linear ticket data
 * No-op if LINEAR_API_KEY is not set
 */
export async function syncLinearTickets(
  storage: StorageAdapter,
  commits: string,
  apiKey?: string
): Promise<LinearSyncResult> {
  if (!apiKey) {
    logger.info('LINEAR_API_KEY not set — skipping Linear sync');
    return { enabled: false, ticketsFetched: 0, patternsEnriched: 0, skippedReason: 'no API key' };
  }

  logger.info('Starting Linear sync');

  const ticketIds = extractTicketIds(commits);
  if (ticketIds.length === 0) {
    return { enabled: true, ticketsFetched: 0, patternsEnriched: 0, skippedReason: 'no ticket IDs in commits' };
  }

  const tickets = await fetchClosedTickets(apiKey);
  const relevantTickets = tickets.filter(t => ticketIds.includes(t.identifier));

  if (relevantTickets.length === 0) {
    return { enabled: true, ticketsFetched: tickets.length, patternsEnriched: 0, skippedReason: 'no matching tickets' };
  }

  // Group tickets by category
  const ticketsByCategory = new Map<TicketCategory, LinearTicket[]>();
  for (const ticket of relevantTickets) {
    const category = mapLabelToCategory(ticket.labels);
    const existing = ticketsByCategory.get(category) ?? [];
    existing.push(ticket);
    ticketsByCategory.set(category, existing);
  }

  // Enrich patterns
  const patterns = await storage.getPatterns();
  let enriched = 0;

  // Map CodingCategory to TicketCategory
  const categoryMap: Record<string, TicketCategory> = {
    'SECURITY': 'security',
    'LOGIC_ERROR': 'bug',
    'TYPE_ERROR': 'bug',
    'IMPORT_ERROR': 'bug',
    'ARCHITECTURE': 'debt',
    'PERFORMANCE': 'debt',
    'TESTING': 'test',
    'DOCUMENTATION': 'docs',
  };

  for (const pattern of patterns) {
    const ticketCategory = categoryMap[pattern.category] ?? 'general';
    const matchingTickets = ticketsByCategory.get(ticketCategory);

    if (matchingTickets && matchingTickets.length > 0) {
      const ticketRefs = matchingTickets
        .map(t => `${t.identifier}: ${t.title}`)
        .join(', ');

      const enrichedDescription = `${pattern.description} | Linear: ${ticketRefs}`.slice(0, 500);

      await storage.updatePattern(pattern.id, { description: enrichedDescription });
      enriched++;

      // Warn if >= 3 bug tickets correlate with same pattern
      if (ticketCategory === 'bug' && matchingTickets.length >= 3) {
        logger.warn(`⚠️ ${matchingTickets.length} bug tickets correlate with pattern: "${pattern.description}"`);
        await storage.saveAlert({
          id: crypto.randomUUID(),
          type: 'LINEAR_SYNC',
          message: `${matchingTickets.length} bug tickets correlate with pattern: "${pattern.description}"`,
          severity: 'MAJOR',
          data: { patternId: pattern.id, ticketIds: matchingTickets.map(t => t.identifier) },
          createdAt: new Date().toISOString(),
          acknowledged: false,
        });
      }
    }
  }

  logger.info(`Linear sync complete: ${enriched} patterns enriched from ${relevantTickets.length} tickets`);

  return {
    enabled: true,
    ticketsFetched: tickets.length,
    patternsEnriched: enriched,
  };
}

