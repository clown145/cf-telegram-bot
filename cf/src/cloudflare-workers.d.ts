declare module "cloudflare:workers" {
  export interface WorkflowEvent<T = unknown> {
    payload: Readonly<T>;
    timestamp: Date;
    instanceId: string;
  }

  export interface WorkflowStepConfig {
    retries?: {
      limit: number;
      delay: string | number;
      backoff?: "constant" | "linear" | "exponential";
    };
    timeout?: string | number;
  }

  export interface WorkflowStep {
    do<T>(name: string, callback: () => T | Promise<T>): Promise<T>;
    do<T>(name: string, config: WorkflowStepConfig, callback: () => T | Promise<T>): Promise<T>;
    sleep(name: string, duration: string | number): Promise<void>;
    sleepUntil(name: string, timestamp: Date | number): Promise<void>;
    waitForEvent<T = unknown>(name: string, options: { type: string; timeout?: string | number }): Promise<T>;
  }

  export abstract class WorkflowEntrypoint<Env = unknown, Params = unknown> {
    protected env: Env;
    abstract run(event: WorkflowEvent<Params>, step: WorkflowStep): Promise<unknown>;
  }
}

interface DurableObject {
  fetch(request: Request): Response | Promise<Response>;
}

interface DurableObjectState {
  storage: {
    get<T = unknown>(key: string): Promise<T | undefined>;
    put(key: string, value: unknown): Promise<void>;
    delete(key: string): Promise<boolean>;
    list<T = unknown>(options?: { prefix?: string; limit?: number; reverse?: boolean }): Promise<Map<string, T>>;
  };
  waitUntil(promise: Promise<unknown>): void;
}

interface DurableObjectId {}

interface DurableObjectStub {
  fetch(request: Request): Promise<Response>;
}

interface DurableObjectNamespace {
  idFromName(name: string): DurableObjectId;
  get(id: DurableObjectId): DurableObjectStub;
}
