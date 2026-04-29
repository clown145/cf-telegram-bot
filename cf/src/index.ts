import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import { StateStore } from "./state-store";

const STORE_NAME = "global";
const INTERNAL_TELEGRAM_PROCESS_PATH = "/internal/telegram/process";
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

export interface Env {
  STATE_STORE: DurableObjectNamespace;
  TELEGRAM_UPDATE_WORKFLOW?: WorkflowBindingLike<TelegramUpdateWorkflowPayload>;
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
