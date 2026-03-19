/**
 * Simple FIFO queue for rate limiting API calls.
 * NOT BullMQ — just a basic in-memory queue.
 */
export class SimpleQueue {
  private queue: Array<() => Promise<unknown>> = [];
  private running = 0;
  private readonly concurrency: number;
  private readonly intervalMs: number;

  constructor(options: { concurrency?: number; intervalMs?: number } = {}) {
    this.concurrency = options.concurrency ?? 3;
    this.intervalMs = options.intervalMs ?? 200; // 5 req/s max
  }

  /**
   * Add a task to the queue and wait for its result
   */
  async add<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await fn();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });
      this.processNext();
    });
  }

  private async processNext(): Promise<void> {
    if (this.running >= this.concurrency || this.queue.length === 0) return;

    this.running++;
    const task = this.queue.shift()!;

    try {
      await task();
    } finally {
      this.running--;
      if (this.intervalMs > 0) {
        await new Promise(r => setTimeout(r, this.intervalMs));
      }
      this.processNext();
    }
  }

  get pending(): number { return this.queue.length; }
  get active(): number { return this.running; }
}

