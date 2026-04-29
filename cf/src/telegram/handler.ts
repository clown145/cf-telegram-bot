import { jsonResponse, parseJson } from "../utils";

const INTERNAL_WORKFLOW_HEADER = "X-CF-Telegram-Bot-Internal";
const TELEGRAM_UPDATE_WORKFLOW_ID_PREFIX = "tg";

export interface TelegramUpdateWorkflowPayload {
  update: Record<string, unknown>;
  received_at: number;
}

export interface TelegramHandlerDeps {
  verifyWebhookSecret(request: Request): Promise<Response | null>;
  checkWebhookRateLimit(request: Request): Response | null;
  processTelegramUpdate(update: Record<string, unknown>): Promise<void>;
  enqueueTelegramUpdateWorkflow(update: Record<string, unknown>): Promise<{
    queued: boolean;
    duplicate?: boolean;
    instance_id?: string;
    error?: string;
  }>;
  state: DurableObjectState;
}

export class TelegramHandler {
  private deps: TelegramHandlerDeps;

  constructor(deps: TelegramHandlerDeps) {
    this.deps = deps;
  }

  async handleInternalTelegramProcess(request: Request): Promise<Response> {
    if (request.headers.get(INTERNAL_WORKFLOW_HEADER) !== "workflow") {
      return jsonResponse({ error: "forbidden" }, 403);
    }
    let payload: TelegramUpdateWorkflowPayload | Record<string, unknown>;
    try {
      payload = await parseJson<TelegramUpdateWorkflowPayload | Record<string, unknown>>(request);
    } catch (error) {
      return jsonResponse({ error: `invalid body: ${String(error)}` }, 400);
    }
    const update =
      payload && typeof payload === "object" && "update" in payload
        ? ((payload as TelegramUpdateWorkflowPayload).update || {})
        : (payload as Record<string, unknown>);
    if (!update || typeof update !== "object" || Array.isArray(update)) {
      return jsonResponse({ error: "missing update" }, 400);
    }
    await this.deps.processTelegramUpdate(update as Record<string, unknown>);
    return jsonResponse({
      status: "ok",
      update_id: (update as any).update_id ?? null,
      processed_at: Date.now(),
    });
  }

  async handleTelegramWebhook(request: Request): Promise<Response> {
    const secretError = await this.deps.verifyWebhookSecret(request);
    if (secretError) {
      return secretError;
    }
    const rateLimitError = this.deps.checkWebhookRateLimit(request);
    if (rateLimitError) {
      return rateLimitError;
    }

    let update: Record<string, unknown> | null = null;
    try {
      update = await parseJson<Record<string, unknown>>(request);
    } catch {
      return jsonResponse({ status: "ok" });
    }

    const queued = await this.deps.enqueueTelegramUpdateWorkflow(update);
    if (queued.queued) {
      return jsonResponse({
        status: "ok",
        background: "cloudflare_workflows",
        instance_id: queued.instance_id,
        duplicate: Boolean(queued.duplicate),
      });
    }
    if (queued.error) {
      console.error("telegram workflow enqueue failed, falling back to waitUntil:", queued.error);
    }

    const task = this.deps.processTelegramUpdate(update).catch((error) => {
      console.error("telegram webhook handling failed:", error);
    });
    this.deps.state.waitUntil(task);
    return jsonResponse({
      status: "ok",
      background: "waitUntil",
      workflow_error: queued.error || undefined,
    });
  }

  buildTelegramUpdateWorkflowId(update: Record<string, unknown>): string {
    const rawUpdateId = String((update as any)?.update_id || "").trim();
    if (rawUpdateId) {
      return `${TELEGRAM_UPDATE_WORKFLOW_ID_PREFIX}-${rawUpdateId}`.slice(0, 100);
    }
    return `${TELEGRAM_UPDATE_WORKFLOW_ID_PREFIX}-${crypto.randomUUID()}`.slice(0, 100);
  }

  isDuplicateWorkflowInstanceError(error: unknown): boolean {
    const message = String(error instanceof Error ? error.message : error || "").toLowerCase();
    return message.includes("already") || message.includes("exists") || message.includes("duplicate");
  }
}
