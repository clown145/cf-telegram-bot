import { generateId, jsonResponse, parseJson } from "../utils";

const AGENT_TASK_ID_PREFIX = "task";
const AGENT_TASK_STALLED_AFTER_MS = 3 * 60 * 1000;
const AGENT_TASK_STORAGE_PREFIX = "agent_task:";
const INTERNAL_WORKFLOW_HEADER = "X-CF-Telegram-Bot-Internal";

interface WorkflowInstanceLike {
  id: string;
  status?(): Promise<unknown>;
}

interface WorkflowBindingLike<T = unknown> {
  create(options?: { id?: string; params?: T }): Promise<WorkflowInstanceLike>;
  get?(id: string): Promise<WorkflowInstanceLike>;
}

interface AgentTaskStorage {
  get<T = unknown>(key: string): Promise<T | undefined>;
  put(key: string, value: unknown): Promise<void>;
  list<T = unknown>(options?: { prefix?: string; limit?: number; reverse?: boolean }): Promise<Map<string, T>>;
  setAlarm?(scheduledTime: number | Date): Promise<void>;
  deleteAlarm?(): Promise<void>;
}

export interface AgentTaskWorkflowPayload {
  task_id: string;
  scheduled_at?: number;
}

export interface AgentTaskChatMessage {
  role: "user" | "assistant";
  content: string;
}

export type AgentTaskStatus =
  | "queued"
  | "waiting"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "stalled";

export interface AgentTaskRecord {
  id: string;
  type: "agent_chat";
  status: AgentTaskStatus;
  title: string;
  source: string;
  input: {
    message: string;
    history?: AgentTaskChatMessage[];
    session_id?: string;
    runtime_context?: Record<string, unknown>;
    model_id?: string;
    notify_chat_id?: string;
  };
  scheduled_at: number;
  created_at: number;
  updated_at: number;
  started_at?: number;
  finished_at?: number;
  heartbeat_at?: number;
  current_step?: string;
  progress?: number;
  attempt: number;
  max_attempts: number;
  workflow_instance_id?: string;
  runner?: string;
  cancel_requested?: boolean;
  result?: Record<string, unknown>;
  result_message?: string;
  error?: string;
  logs: Array<{
    at: number;
    level: "info" | "warn" | "error";
    message: string;
    data?: unknown;
  }>;
}

export interface AgentTaskHeartbeatPatch {
  current_step?: string;
  progress?: number;
}

export interface AgentTaskDependencies {
  storage: AgentTaskStorage;
  waitUntil(promise: Promise<unknown>): void;
  workflow?: WorkflowBindingLike<AgentTaskWorkflowPayload>;
  normalizeChatHistory(input: unknown): AgentTaskChatMessage[];
  normalizeSessionId(input: unknown): string;
  normalizeRuntimePayload(input: unknown): Record<string, unknown>;
  compactLogValue(value: unknown, limit?: number): unknown;
  sanitizeErrorMessage(error: unknown): string;
  handleAgentChat(request: Request): Promise<Response>;
  sendText(chatId: string, text: string, parseMode?: string): Promise<void>;
}

export function normalizeAgentTaskId(input: unknown): string {
  return String(input || "")
    .trim()
    .replace(/[^a-zA-Z0-9:._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 128);
}

function agentTaskKey(taskId: string): string {
  return `${AGENT_TASK_STORAGE_PREFIX}${taskId}`;
}

function normalizeAgentTaskScheduledAt(input: unknown): number {
  const raw = typeof input === "string" && input.trim() ? Date.parse(input) : Number(input || 0);
  if (!Number.isFinite(raw) || raw <= 0) {
    return Date.now();
  }
  return Math.max(Date.now(), Math.trunc(raw));
}

export class AgentTaskService {
  constructor(private readonly deps: AgentTaskDependencies) {}

  normalizeId(input: unknown): string {
    return normalizeAgentTaskId(input);
  }

  private normalizeRecord(raw: unknown): AgentTaskRecord | null {
    const source = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
    const id = normalizeAgentTaskId(source.id);
    const input =
      source.input && typeof source.input === "object" && !Array.isArray(source.input)
        ? (source.input as Record<string, unknown>)
        : {};
    const message = String(input.message || "").trim();
    if (!id || !message) {
      return null;
    }
    const statusRaw = String(source.status || "queued");
    const status: AgentTaskStatus = [
      "queued",
      "waiting",
      "running",
      "succeeded",
      "failed",
      "cancelled",
      "stalled",
    ].includes(statusRaw)
      ? (statusRaw as AgentTaskStatus)
      : "queued";
    const logsRaw = Array.isArray(source.logs) ? source.logs : [];
    return {
      id,
      type: "agent_chat",
      status,
      title: String(source.title || message).trim().slice(0, 160) || "Agent task",
      source: String(source.source || "api").trim() || "api",
      input: {
        message,
        history: this.deps.normalizeChatHistory(input.history),
        session_id: this.deps.normalizeSessionId(input.session_id),
        runtime_context: this.deps.normalizeRuntimePayload(input.runtime_context || input.runtime),
        model_id: String(input.model_id || "").trim(),
        notify_chat_id: String(input.notify_chat_id || "").trim(),
      },
      scheduled_at: Number(source.scheduled_at || Date.now()),
      created_at: Number(source.created_at || Date.now()),
      updated_at: Number(source.updated_at || Date.now()),
      started_at: source.started_at ? Number(source.started_at) : undefined,
      finished_at: source.finished_at ? Number(source.finished_at) : undefined,
      heartbeat_at: source.heartbeat_at ? Number(source.heartbeat_at) : undefined,
      current_step: typeof source.current_step === "string" ? source.current_step : undefined,
      progress: Number.isFinite(Number(source.progress)) ? Number(source.progress) : undefined,
      attempt: Math.max(0, Math.trunc(Number(source.attempt || 0))),
      max_attempts: Math.max(1, Math.min(10, Math.trunc(Number(source.max_attempts || 3)))),
      workflow_instance_id: typeof source.workflow_instance_id === "string" ? source.workflow_instance_id : undefined,
      runner: typeof source.runner === "string" ? source.runner : undefined,
      cancel_requested: Boolean(source.cancel_requested),
      result:
        source.result && typeof source.result === "object" && !Array.isArray(source.result)
          ? (source.result as Record<string, unknown>)
          : undefined,
      result_message: typeof source.result_message === "string" ? source.result_message : undefined,
      error: typeof source.error === "string" ? source.error : undefined,
      logs: logsRaw
        .map((entry): AgentTaskRecord["logs"][number] | null => {
          const item = entry && typeof entry === "object" ? (entry as Record<string, unknown>) : {};
          const level = item.level === "warn" || item.level === "error" ? item.level : "info";
          const text = String(item.message || "").trim();
          if (!text) {
            return null;
          }
          const log: AgentTaskRecord["logs"][number] = {
            at: Number(item.at || Date.now()),
            level: level as "info" | "warn" | "error",
            message: text.slice(0, 1000),
          };
          if (item.data !== undefined) {
            log.data = item.data;
          }
          return log;
        })
        .filter((entry): entry is AgentTaskRecord["logs"][number] => Boolean(entry))
        .slice(-200),
    };
  }

  private publicTask(task: AgentTaskRecord): Record<string, unknown> {
    return {
      id: task.id,
      type: task.type,
      status: task.status,
      title: task.title,
      source: task.source,
      message: task.input.message,
      session_id: task.input.session_id || "",
      model_id: task.input.model_id || "",
      notify_chat_id: task.input.notify_chat_id || "",
      scheduled_at: task.scheduled_at,
      created_at: task.created_at,
      updated_at: task.updated_at,
      started_at: task.started_at || null,
      finished_at: task.finished_at || null,
      heartbeat_at: task.heartbeat_at || null,
      current_step: task.current_step || "",
      progress: task.progress ?? null,
      attempt: task.attempt,
      max_attempts: task.max_attempts,
      workflow_instance_id: task.workflow_instance_id || "",
      runner: task.runner || "",
      cancel_requested: Boolean(task.cancel_requested),
      result_message: task.result_message || "",
      result: task.result || null,
      error: task.error || "",
      logs: task.logs.slice(-80),
    };
  }

  private async load(taskId: string): Promise<AgentTaskRecord | null> {
    const id = normalizeAgentTaskId(taskId);
    if (!id) {
      return null;
    }
    return this.normalizeRecord(await this.deps.storage.get<AgentTaskRecord>(agentTaskKey(id)));
  }

  private async save(task: AgentTaskRecord): Promise<void> {
    task.updated_at = Date.now();
    await this.deps.storage.put(agentTaskKey(task.id), task);
  }

  private appendLog(
    task: AgentTaskRecord,
    level: "info" | "warn" | "error",
    message: string,
    data?: unknown
  ): AgentTaskRecord {
    task.logs = [
      ...(task.logs || []),
      {
        at: Date.now(),
        level,
        message: String(message || "").slice(0, 1000),
        data: data === undefined ? undefined : this.deps.compactLogValue(data, 6000),
      },
    ].slice(-200);
    return task;
  }

  private async listRaw(): Promise<AgentTaskRecord[]> {
    const listed = await this.deps.storage.list<AgentTaskRecord>({ prefix: AGENT_TASK_STORAGE_PREFIX });
    return Array.from(listed.values())
      .map((entry) => this.normalizeRecord(entry))
      .filter((entry): entry is AgentTaskRecord => Boolean(entry))
      .sort((a, b) => b.created_at - a.created_at);
  }

  private async markStalled(): Promise<number> {
    const now = Date.now();
    let changed = 0;
    const tasks = await this.listRaw();
    for (const task of tasks) {
      if (task.status !== "running") {
        continue;
      }
      const heartbeatAt = Number(task.heartbeat_at || task.started_at || task.updated_at || 0);
      if (heartbeatAt > 0 && now - heartbeatAt <= AGENT_TASK_STALLED_AFTER_MS) {
        continue;
      }
      task.status = "stalled";
      task.error = "task heartbeat expired";
      task.finished_at = now;
      this.appendLog(task, "warn", "Marked stalled because heartbeat expired.");
      await this.save(task);
      changed += 1;
    }
    return changed;
  }

  private async scheduleNextAlarm(): Promise<void> {
    if (typeof this.deps.storage.setAlarm !== "function") {
      return;
    }
    const tasks = await this.listRaw();
    const next = tasks
      .filter((task) => task.status === "waiting" && !task.cancel_requested)
      .sort((a, b) => a.scheduled_at - b.scheduled_at)[0];
    if (next) {
      await this.deps.storage.setAlarm(Math.max(Date.now() + 1000, next.scheduled_at));
    } else if (typeof this.deps.storage.deleteAlarm === "function") {
      await this.deps.storage.deleteAlarm();
    }
  }

  async updateHeartbeat(taskId: string, patch: AgentTaskHeartbeatPatch = {}): Promise<void> {
    const task = await this.load(taskId);
    if (!task || task.status !== "running") {
      return;
    }
    task.heartbeat_at = Date.now();
    if (patch.current_step !== undefined) {
      task.current_step = patch.current_step;
    }
    if (patch.progress !== undefined) {
      task.progress = patch.progress;
    }
    await this.save(task);
  }

  private async enqueue(task: AgentTaskRecord): Promise<{ mode: string; workflow_instance_id?: string; error?: string }> {
    const binding = this.deps.workflow;
    if (binding && typeof binding.create === "function") {
      const instanceId = [
        AGENT_TASK_ID_PREFIX,
        task.id.slice(0, 64),
        `a${task.attempt}`,
        `t${Date.now().toString(36)}`,
      ]
        .join("-")
        .slice(0, 100);
      try {
        const instance = await binding.create({
          id: instanceId,
          params: { task_id: task.id, scheduled_at: task.scheduled_at },
        });
        task.workflow_instance_id = instance?.id || instanceId;
        task.runner = "cloudflare_workflows";
        await this.save(task);
        return { mode: "cloudflare_workflows", workflow_instance_id: task.workflow_instance_id };
      } catch (error) {
        this.appendLog(task, "warn", "Cloudflare Workflow enqueue failed; falling back to Durable Object.", String(error));
        await this.save(task);
      }
    }

    task.runner = "durable_object";
    await this.save(task);
    if (task.scheduled_at > Date.now()) {
      await this.scheduleNextAlarm();
      return { mode: "durable_object_alarm" };
    }
    this.deps.waitUntil(this.runTask(task.id, "waitUntil"));
    return { mode: "waitUntil" };
  }

  private async createFromPayload(payload: Record<string, unknown>): Promise<{
    task?: AgentTaskRecord;
    enqueue?: Record<string, unknown>;
    error?: string;
    status?: number;
  }> {
    const message = String(payload.message || payload.prompt || "").trim();
    if (!message) {
      return { error: "message is required", status: 400 };
    }
    const now = Date.now();
    const scheduledAt = normalizeAgentTaskScheduledAt(payload.scheduled_at || payload.run_at);
    const runtimeContext = this.deps.normalizeRuntimePayload(payload.runtime_context || payload.runtime);
    const task: AgentTaskRecord = {
      id: normalizeAgentTaskId(payload.id) || generateId(AGENT_TASK_ID_PREFIX),
      type: "agent_chat",
      status: scheduledAt > now ? "waiting" : "queued",
      title: String(payload.title || message).trim().slice(0, 160) || "Agent task",
      source: String(payload.source || "api").trim() || "api",
      input: {
        message,
        history: this.deps.normalizeChatHistory(payload.history),
        session_id: this.deps.normalizeSessionId(payload.session_id),
        runtime_context: runtimeContext,
        model_id: String(payload.model_id || "").trim(),
        notify_chat_id: String(payload.notify_chat_id || runtimeContext.chat_id || "").trim(),
      },
      scheduled_at: scheduledAt,
      created_at: now,
      updated_at: now,
      heartbeat_at: now,
      attempt: 0,
      max_attempts: Math.max(1, Math.min(10, Math.trunc(Number(payload.max_attempts || 3)))),
      logs: [],
    };
    this.appendLog(task, "info", task.status === "waiting" ? "Task scheduled." : "Task queued.");
    await this.save(task);
    const enqueue = await this.enqueue(task);
    return { task: (await this.load(task.id)) || task, enqueue };
  }

  async runDue(runner: string): Promise<void> {
    await this.markStalled();
    const now = Date.now();
    const tasks = await this.listRaw();
    for (const task of tasks) {
      if (task.status !== "waiting" || task.cancel_requested || task.scheduled_at > now) {
        continue;
      }
      this.deps.waitUntil(this.runTask(task.id, runner));
    }
    await this.scheduleNextAlarm();
  }

  private async runTask(taskId: string, runner: string): Promise<Record<string, unknown>> {
    let task = await this.load(taskId);
    if (!task) {
      return { ok: false, error: `task not found: ${taskId}` };
    }
    const now = Date.now();
    if (task.cancel_requested || task.status === "cancelled") {
      task.status = "cancelled";
      task.finished_at = now;
      this.appendLog(task, "info", "Task was cancelled before execution.");
      await this.save(task);
      return { ok: true, skipped: true, status: task.status };
    }
    if (task.status === "succeeded") {
      return { ok: true, skipped: true, status: task.status };
    }
    if (task.scheduled_at > now) {
      task.status = "waiting";
      await this.save(task);
      await this.scheduleNextAlarm();
      return { ok: true, waiting: true, scheduled_at: task.scheduled_at };
    }

    task.status = "running";
    task.runner = runner;
    task.attempt += 1;
    task.started_at = task.started_at || now;
    task.heartbeat_at = now;
    task.current_step = "agent_chat";
    task.progress = 0.05;
    task.error = "";
    this.appendLog(task, "info", "Task started.", { runner, attempt: task.attempt });
    await this.save(task);

    try {
      const response = await this.deps.handleAgentChat(
        new Request("https://internal.local/api/agent/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: task.input.message,
            history: task.input.history || [],
            session_id: task.input.session_id || `task:${task.id}`,
            runtime_context: task.input.runtime_context || {},
            model_id: task.input.model_id || undefined,
            task_id: task.id,
          }),
        })
      );
      const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      task = (await this.load(task.id)) || task;
      if (task.cancel_requested) {
        task.status = "cancelled";
        task.finished_at = Date.now();
        this.appendLog(task, "info", "Task was cancelled after agent returned.");
        await this.save(task);
        return { ok: true, status: task.status };
      }
      if (!response.ok || data.error) {
        throw new Error(String(data.error || `agent chat failed: ${response.status}`));
      }
      task.status = "succeeded";
      task.finished_at = Date.now();
      task.heartbeat_at = task.finished_at;
      task.progress = 1;
      task.current_step = "done";
      task.result = data;
      task.result_message = String(data.message || "").trim();
      this.appendLog(task, "info", "Task succeeded.");
      await this.save(task);
      if (task.input.notify_chat_id && task.result_message) {
        await this.deps.sendText(task.input.notify_chat_id, task.result_message.slice(0, 4096), undefined).catch((error) => {
          console.error("send task result failed:", error);
        });
      }
      return { ok: true, status: task.status, task: this.publicTask(task) };
    } catch (error) {
      task = (await this.load(task.id)) || task;
      task.status = task.attempt < task.max_attempts ? "queued" : "failed";
      task.finished_at = task.status === "failed" ? Date.now() : undefined;
      task.heartbeat_at = Date.now();
      task.error = this.deps.sanitizeErrorMessage(error);
      this.appendLog(task, "error", task.error);
      await this.save(task);
      if (task.status === "queued") {
        const enqueue = await this.enqueue(task);
        return { ok: false, retrying: true, enqueue };
      }
      if (task.input.notify_chat_id) {
        await this.deps.sendText(task.input.notify_chat_id, `Agent 任务失败: ${task.error}`, undefined).catch((sendError) => {
          console.error("send task failure failed:", sendError);
        });
      }
      return { ok: false, status: task.status, error: task.error };
    }
  }

  async handleList(url: URL): Promise<Response> {
    await this.markStalled();
    const status = String(url.searchParams.get("status") || "").trim();
    const limitRaw = Number(url.searchParams.get("limit") || 100);
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(300, Math.trunc(limitRaw))) : 100;
    const tasks = (await this.listRaw())
      .filter((task) => !status || task.status === status)
      .slice(0, limit)
      .map((task) => this.publicTask(task));
    return jsonResponse({ status: "ok", tasks, total: tasks.length });
  }

  async handleCreate(request: Request): Promise<Response> {
    let payload: Record<string, unknown>;
    try {
      payload = await parseJson<Record<string, unknown>>(request);
    } catch (error) {
      return jsonResponse({ error: `invalid body: ${String(error)}` }, 400);
    }
    const result = await this.createFromPayload(payload);
    if (result.error || !result.task) {
      return jsonResponse({ error: result.error || "create task failed" }, result.status || 400);
    }
    return jsonResponse({
      status: "ok",
      task: this.publicTask(result.task),
      enqueue: result.enqueue || {},
    });
  }

  async handleGet(taskId: string): Promise<Response> {
    const task = await this.load(taskId);
    if (!task) {
      return jsonResponse({ error: `task not found: ${taskId}` }, 404);
    }
    return jsonResponse({ status: "ok", task: this.publicTask(task) });
  }

  async handleCancel(taskId: string): Promise<Response> {
    const task = await this.load(taskId);
    if (!task) {
      return jsonResponse({ error: `task not found: ${taskId}` }, 404);
    }
    if (["succeeded", "failed", "cancelled"].includes(task.status)) {
      return jsonResponse({ status: "ok", task: this.publicTask(task) });
    }
    task.cancel_requested = true;
    if (task.status !== "running") {
      task.status = "cancelled";
      task.finished_at = Date.now();
    }
    this.appendLog(task, "warn", "Cancellation requested.");
    await this.save(task);
    await this.scheduleNextAlarm();
    return jsonResponse({ status: "ok", task: this.publicTask(task) });
  }

  async handleRetry(taskId: string): Promise<Response> {
    const task = await this.load(taskId);
    if (!task) {
      return jsonResponse({ error: `task not found: ${taskId}` }, 404);
    }
    if (!["failed", "stalled", "cancelled"].includes(task.status)) {
      return jsonResponse({ error: `task cannot be retried from status: ${task.status}` }, 400);
    }
    task.status = task.scheduled_at > Date.now() ? "waiting" : "queued";
    task.cancel_requested = false;
    task.error = "";
    task.attempt = 0;
    task.started_at = undefined;
    task.finished_at = undefined;
    task.heartbeat_at = Date.now();
    task.current_step = "queued";
    task.progress = 0;
    this.appendLog(task, "info", "Task retry requested.");
    await this.save(task);
    const enqueue = await this.enqueue(task);
    return jsonResponse({ status: "ok", task: this.publicTask((await this.load(task.id)) || task), enqueue });
  }

  async handleInternalRun(request: Request): Promise<Response> {
    if (request.headers.get(INTERNAL_WORKFLOW_HEADER) !== "workflow") {
      return jsonResponse({ error: "forbidden" }, 403);
    }
    let payload: Record<string, unknown>;
    try {
      payload = await parseJson<Record<string, unknown>>(request);
    } catch (error) {
      return jsonResponse({ error: `invalid body: ${String(error)}` }, 400);
    }
    const taskId = normalizeAgentTaskId(payload.task_id || payload.id);
    if (!taskId) {
      return jsonResponse({ error: "task_id is required" }, 400);
    }
    const result = await this.runTask(taskId, "cloudflare_workflows");
    return jsonResponse(result, result.ok === false && !result.retrying ? 500 : 200);
  }
}
