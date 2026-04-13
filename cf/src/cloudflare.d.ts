declare global {
  interface DurableObjectId {}

  interface DurableObjectStub {
    fetch(request: Request): Promise<Response>;
  }

  interface DurableObjectStorage {
    get<T = unknown>(key: string): Promise<T | undefined>;
    put<T = unknown>(key: string, value: T): Promise<void>;
    delete(key: string): Promise<void>;
  }

  interface DurableObjectState {
    storage: DurableObjectStorage;
    waitUntil?(promise: Promise<unknown>): void;
    blockConcurrencyWhile?<T>(callback: () => Promise<T>): Promise<T>;
  }

  interface DurableObjectNamespace {
    idFromName(name: string): DurableObjectId;
    get(id: DurableObjectId): DurableObjectStub;
  }

  interface DurableObject {
    fetch(request: Request): Promise<Response>;
  }
}

export {};
