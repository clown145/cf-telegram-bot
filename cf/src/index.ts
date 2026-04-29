import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import { StateStore } from "./state-store";

const STORE_NAME = "global";
const INTERNAL_TELEGRAM_PROCESS_PATH = "/internal/telegram/process";
const INTERNAL_TASK_RUN_PATH = "/internal/tasks/run";
const INTERNAL_WORKFLOW_HEADER = "X-CF-Telegram-Bot-Internal";

interface WorkflowInstanceLike {
  id: string;
  status?(): Promise<unknown>;
}

interface WorkflowBindingLike<T = unknown> {
  create(options?: { id?: string; params?: T }): Promise<WorkflowInstanceLike>;
  get?(id: string): Promise<WorkflowInstanceLike>;
}

interface TelegramUpdateWorkflowPayload {
  update: Record<string, unknown>;
  received_at: number;
}

interface AgentTaskWorkflowPayload {
  task_id: string;
  scheduled_at?: number;
}

export interface Env {
  STATE_STORE: DurableObjectNamespace;
  TELEGRAM_UPDATE_WORKFLOW?: WorkflowBindingLike<TelegramUpdateWorkflowPayload>;
  AGENT_TASK_WORKFLOW?: WorkflowBindingLike<AgentTaskWorkflowPayload>;
  SKILLS_DB?: unknown;
  WEBUI_AUTH_TOKEN?: string;
  TELEGRAM_BOT_TOKEN?: string;
  OPENAI_API_KEY?: string;
  LLM_API_KEY?: string;
  OPENAI_BASE_URL?: string;
  OPENAI_DEFAULT_MODEL?: string;
  FILE_BUCKET?: unknown;
  ASSETS?: { fetch(request: Request): Promise<Response> };
}

export { StateStore };

export class TelegramUpdateWorkflow extends WorkflowEntrypoint<Env, TelegramUpdateWorkflowPayload> {
  async run(event: WorkflowEvent<TelegramUpdateWorkflowPayload>, step: WorkflowStep) {
    return await step.do(
      "process telegram update",
      {
        retries: {
          limit: 3,
          delay: "5 seconds",
          backoff: "exponential",
        },
        timeout: "5 minutes",
      },
      async () => {
        const stub = this.env.STATE_STORE.get(this.env.STATE_STORE.idFromName(STORE_NAME));
        const response = await stub.fetch(
          new Request(`https://internal.local${INTERNAL_TELEGRAM_PROCESS_PATH}`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [INTERNAL_WORKFLOW_HEADER]: "workflow",
            },
            body: JSON.stringify(event.payload || {}),
          })
        );
        const text = await response.text();
        if (!response.ok) {
          throw new Error(`telegram update processing failed: ${response.status} ${text}`);
        }
        try {
          return JSON.parse(text);
        } catch {
          return { status: "ok", response: text };
        }
      }
    );
  }
}

export class AgentTaskWorkflow extends WorkflowEntrypoint<Env, AgentTaskWorkflowPayload> {
  async run(event: WorkflowEvent<AgentTaskWorkflowPayload>, step: WorkflowStep) {
    const payload = (event.payload || {}) as Partial<AgentTaskWorkflowPayload>;
    const taskId = String(payload.task_id || "").trim();
    if (!taskId) {
      throw new Error("missing task_id");
    }
    const scheduledAt = Number(payload.scheduled_at || 0);
    if (Number.isFinite(scheduledAt) && scheduledAt > Date.now()) {
      await step.sleepUntil("wait until scheduled time", new Date(scheduledAt));
    }

    return await step.do(
      "run agent task",
      {
        retries: {
          limit: 2,
          delay: "10 seconds",
          backoff: "exponential",
        },
        timeout: "30 minutes",
      },
      async () => {
        const stub = this.env.STATE_STORE.get(this.env.STATE_STORE.idFromName(STORE_NAME));
        const response = await stub.fetch(
          new Request(`https://internal.local${INTERNAL_TASK_RUN_PATH}`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [INTERNAL_WORKFLOW_HEADER]: "workflow",
            },
            body: JSON.stringify({ task_id: taskId }),
          })
        );
        const text = await response.text();
        if (!response.ok) {
          throw new Error(`agent task failed: ${response.status} ${text}`);
        }
        try {
          return JSON.parse(text);
        } catch {
          return { status: "ok", response: text };
        }
      }
    );
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/telegram/")) {
      const stub = env.STATE_STORE.get(env.STATE_STORE.idFromName(STORE_NAME));
      try {
        return await stub.fetch(request);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return new Response(JSON.stringify({ error: "state store request failed", detail: message }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    if (env.ASSETS) {
      const isAsset = url.pathname.includes(".");
      if (!isAsset) {
        url.pathname = "/index.html";
      }
      const assetRequest = new Request(url.toString(), request);
      return env.ASSETS.fetch(assetRequest);
    }

    return new Response("Not found", { status: 404 });
  },
};
