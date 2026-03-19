import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SimpleQueue } from '../ai/queue.js';

describe('SimpleQueue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('executes a single task and returns its result', async () => {
    const queue = new SimpleQueue({ intervalMs: 0 });
    const fn = vi.fn().mockResolvedValue('done');

    const resultPromise = queue.add(fn);
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(fn).toHaveBeenCalledTimes(1);
    expect(result).toBe('done');
  });

  it('propagates errors from tasks', async () => {
    const queue = new SimpleQueue({ intervalMs: 0 });
    const fn = vi.fn().mockRejectedValue(new Error('task failed'));

    // Attach rejection handler immediately to avoid unhandled rejection warning
    await expect(queue.add(fn)).rejects.toThrow('task failed');
  });

  it('executes tasks sequentially within concurrency limit', async () => {
    const queue = new SimpleQueue({ concurrency: 1, intervalMs: 0 });
    const order: number[] = [];

    const task = (n: number) => vi.fn(async () => { order.push(n); });

    const p1 = queue.add(task(1));
    const p2 = queue.add(task(2));
    const p3 = queue.add(task(3));

    await vi.runAllTimersAsync();
    await Promise.all([p1, p2, p3]);

    expect(order).toEqual([1, 2, 3]);
  });

  it('runs up to concurrency tasks in parallel', async () => {
    const queue = new SimpleQueue({ concurrency: 2, intervalMs: 0 });
    let running = 0;
    let maxConcurrent = 0;

    const makeTask = () => vi.fn(async () => {
      running++;
      maxConcurrent = Math.max(maxConcurrent, running);
      await new Promise(r => setTimeout(r, 10));
      running--;
    });

    const p1 = queue.add(makeTask());
    const p2 = queue.add(makeTask());
    const p3 = queue.add(makeTask());

    await vi.runAllTimersAsync();
    await Promise.all([p1, p2, p3]);

    expect(maxConcurrent).toBe(2);
  });

  it('pending returns queued task count', () => {
    // Use long interval to keep tasks in queue
    const queue = new SimpleQueue({ concurrency: 1, intervalMs: 10000 });

    // Don't await — just enqueue
    queue.add(() => new Promise(r => setTimeout(r, 5000)));
    queue.add(() => Promise.resolve('b'));
    queue.add(() => Promise.resolve('c'));

    // 1 is running, 2 are pending
    expect(queue.pending).toBe(2);
  });

  it('active returns running task count', () => {
    const queue = new SimpleQueue({ concurrency: 2, intervalMs: 10000 });

    queue.add(() => new Promise(r => setTimeout(r, 5000)));
    queue.add(() => new Promise(r => setTimeout(r, 5000)));
    queue.add(() => Promise.resolve('c'));

    expect(queue.active).toBe(2);
  });

  it('defaults to concurrency=3 and intervalMs=200', () => {
    const queue = new SimpleQueue();
    expect(queue.pending).toBe(0);
    expect(queue.active).toBe(0);
  });

  it('handles multiple tasks with intervalMs delay between them', async () => {
    const queue = new SimpleQueue({ concurrency: 1, intervalMs: 100 });
    const results: string[] = [];

    const p1 = queue.add(async () => { results.push('a'); return 'a'; });
    const p2 = queue.add(async () => { results.push('b'); return 'b'; });

    // Advance past first task + interval
    await vi.advanceTimersByTimeAsync(200);
    await p1;
    // Advance past second task + interval
    await vi.advanceTimersByTimeAsync(200);
    await p2;

    expect(results).toEqual(['a', 'b']);
  });
});

