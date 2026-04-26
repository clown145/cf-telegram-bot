type Waitable = Promise<unknown> | { then?: (...args: any[]) => any };

function cloneValue<T>(value: T): T {
  try {
    return structuredClone(value);
  } catch {
    return value;
  }
}

export class MemoryStorage {
  private data = new Map<string, unknown>();

  async get<T>(key: string): Promise<T | undefined> {
    return this.data.get(key) as T | undefined;
  }

  async put(key: string, value: unknown): Promise<void> {
    this.data.set(key, cloneValue(value));
  }

  async delete(key: string): Promise<boolean> {
    return this.data.delete(key);
  }

  async list<T = unknown>(options: { prefix?: string; limit?: number; reverse?: boolean } = {}): Promise<Map<string, T>> {
    const entries = Array.from(this.data.entries())
      .filter(([key]) => !options.prefix || key.startsWith(options.prefix))
      .sort((a, b) => a[0].localeCompare(b[0]));
    if (options.reverse) {
      entries.reverse();
    }
    const limited = options.limit && options.limit > 0 ? entries.slice(0, options.limit) : entries;
    return new Map(limited.map(([key, value]) => [key, cloneValue(value as T)]));
  }

  seed(key: string, value: unknown): void {
    this.data.set(key, cloneValue(value));
  }
}

export class MockDurableObjectState {
  storage = new MemoryStorage();
  private waitUntilQueue: Promise<unknown>[] = [];

  waitUntil(promise: Waitable): void {
    this.waitUntilQueue.push(Promise.resolve(promise));
  }

  async drainWaitUntil(): Promise<void> {
    if (!this.waitUntilQueue.length) {
      return;
    }
    const pending = [...this.waitUntilQueue];
    this.waitUntilQueue = [];
    await Promise.allSettled(pending);
  }
}
