/**
 * Global write queue for AnkiConnect operations.
 * Serializes all write operations to prevent race conditions
 * when Telegram and portal write simultaneously.
 *
 * Singleton via globalThis to survive HMR.
 */

class WriteQueue {
  private tail: Promise<void> = Promise.resolve();
  private _pending = 0;

  /** Number of tasks waiting + currently running */
  get pending(): number {
    return this._pending;
  }

  /** Add a task to the queue. Waits for its turn, then runs and returns the result. */
  enqueue<T>(fn: () => Promise<T>): Promise<T> {
    this._pending++;
    const result = this.tail.then(
      () => fn(),
      () => fn() // previous task errored — still run this one
    );
    // Advance the tail regardless of success/failure
    this.tail = result.then(
      () => { this._pending--; },
      () => { this._pending--; }
    );
    return result;
  }
}

const GLOBAL_KEY = "__ankiWriteQueue" as const;

function getQueue(): WriteQueue {
  const g = globalThis as unknown as Record<string, WriteQueue>;
  if (!g[GLOBAL_KEY]) {
    g[GLOBAL_KEY] = new WriteQueue();
  }
  return g[GLOBAL_KEY];
}

export const writeQueue = getQueue();
