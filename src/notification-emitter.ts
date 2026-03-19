import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createLogger } from './logger.js';
import type { StorageAdapter } from './storage/adapter.js';

const logger = createLogger('notification-emitter');

const NOTIFICATIONS_DIR = '.learnings';
const NOTIFICATIONS_FILE = 'notifications.md';

/**
 * Emit notifications for unacknowledged alerts to `.learnings/notifications.md`.
 * Appends new entries to any existing file, then acknowledges each alert in storage.
 */
export async function emitNotifications(
  storage: StorageAdapter,
  cwd: string = process.cwd()
): Promise<{ emitted: number; filePath: string }> {
  logger.info('Emitting notifications');

  const alerts = await storage.getAlerts({ acknowledged: false });

  if (alerts.length === 0) {
    logger.info('No unacknowledged alerts');
    return { emitted: 0, filePath: '' };
  }

  const dir = join(cwd, NOTIFICATIONS_DIR);
  mkdirSync(dir, { recursive: true });

  const filePath = join(dir, NOTIFICATIONS_FILE);

  // Read existing content if any
  let existing = '';
  if (existsSync(filePath)) {
    existing = readFileSync(filePath, 'utf-8');
  }

  const newEntries: string[] = [];

  for (const alert of alerts) {
    const entry = [
      `## [${alert.severity}] ${alert.type}`,
      `> ${alert.createdAt}`,
      '',
      alert.message,
      '',
      '---',
      '',
    ].join('\n');

    newEntries.push(entry);
    await storage.acknowledgeAlert(alert.id);
  }

  const header = existing ? '' : '# AutoClaw Notifications\n\n';
  const content = header + existing + newEntries.join('\n');

  writeFileSync(filePath, content, 'utf-8');

  logger.info(`Emitted ${alerts.length} notifications to ${filePath}`);
  return { emitted: alerts.length, filePath };
}

