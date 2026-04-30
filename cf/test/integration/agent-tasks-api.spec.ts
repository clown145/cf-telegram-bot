import { StateStore } from "../../src/state-store";
import { MockDurableObjectState } from "../helpers/mock-do";

interface ApiCallOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
}

function createStore(envOverrides: Record<string, unknown> = {}) {
  const state = new MockDurableObjectState();
  const env = {
    WEBUI_AUTH_TOKEN: "",
    ALLOW_INSECURE_API: "true",
    TELEGRAM_BOT_TOKEN: "test_token",
    ...envOverrides,
  };
  const store = new StateStore(state as any, env as any);
  return { state, store };
}

async function callApi(store: StateStore, path: string, options: ApiCallOptions = {}): Promise<Response> {
  const headers = new Headers(options.headers || {});
  const body = options.body === undefined ? undefined : JSON.stringify(options.body);
  if (body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return await store.fetch(
    new Request(`https://example.com${path}`, {
      method: options.method || "GET",
      headers,
      body,
    })
  );
}

async function seedLlmConfig(state: MockDurableObjectState) {
  await state.storage.put("llm_config", {
    providers: {
      provider_1: {
        id: "provider_1",
        name: "OpenAI",
        type: "openai",
        base_url: "https://llm.example/v1",
        api_key: "secret-key",
        enabled: true,
      },
    },
    models: {
      "provider_1:gpt-test": {
        id: "provider_1:gpt-test",
        provider_id: "provider_1",
        model: "gpt-test",
        name: "GPT Test",
        enabled: true,
      },
    },
  });
  const store = new StateStore(
    state as any,
    { WEBUI_AUTH_TOKEN: "", ALLOW_INSECURE_API: "true", TELEGRAM_BOT_TOKEN: "test_token" } as any
  );
  await callApi(store, "/api/agent/config", {
    method: "PUT",
    body: { default_model_id: "provider_1:gpt-test" },
  });
}

describe("agent tasks api", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("creates scheduled Agent tasks and enqueues Cloudflare Workflows", async () => {
    const createWorkflow = vi.fn(async (options: any) => ({ id: options.id }));
    const { store } = createStore({
      AGENT_TASK_WORKFLOW: {
        create: createWorkflow,
      },
    });

    const scheduledAt = Date.now() + 60_000;
    const res = await callApi(store, "/api/tasks", {
      method: "POST",
      body: {
        id: "task_future",
        message: "明天提醒我检查工作流",
        scheduled_at: scheduledAt,
        source: "test",
      },
    });
    const body = (await res.json()) as any;

    expect(res.status).toBe(200);
    expect(body.task).toMatchObject({
      id: "task_future",
      status: "waiting",
      source: "test",
      runner: "cloudflare_workflows",
    });
    expect(body.enqueue.mode).toBe("cloudflare_workflows");
    expect(createWorkflow).toHaveBeenCalledTimes(1);
    expect(createWorkflow.mock.calls[0][0].id).toMatch(/^task-task_future-a0-t/);
    expect(createWorkflow.mock.calls[0][0]).toMatchObject({
      params: {
        task_id: "task_future",
        scheduled_at: scheduledAt,
      },
    });
  });

  it("runs an Agent task through the internal runner and records heartbeat/result", async () => {
    const llmRequests: any[] = [];
    const telegramMessages: any[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const body = typeof init?.body === "string" ? JSON.parse(init.body) : {};
      if (url.includes("/chat/completions")) {
        llmRequests.push(body);
        return new Response(
          JSON.stringify({
            model: "gpt-test",
            choices: [{ message: { role: "assistant", content: "任务完成。" }, finish_reason: "stop" }],
            usage: {},
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      if (url.includes("/sendMessage")) {
        telegramMessages.push(body);
        return new Response(JSON.stringify({ ok: true, result: { message_id: telegramMessages.length } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ ok: true, result: {} }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const createWorkflow = vi.fn(async (options: any) => ({ id: options.id }));
    const { state, store } = createStore({
      AGENT_TASK_WORKFLOW: {
        create: createWorkflow,
      },
    });
    await seedLlmConfig(state);

    const createRes = await callApi(store, "/api/tasks", {
      method: "POST",
      body: {
        id: "task_run",
        message: "执行一个长任务",
        session_id: "task-session",
        notify_chat_id: "42",
      },
    });
    expect(createRes.status).toBe(200);

    const runRes = await callApi(store, "/internal/tasks/run", {
      method: "POST",
      headers: { "X-CF-Telegram-Bot-Internal": "workflow" },
      body: { task_id: "task_run" },
    });
    const runBody = (await runRes.json()) as any;
    const detailRes = await callApi(store, "/api/tasks/task_run");
    const detail = (await detailRes.json()) as any;

    expect(runRes.status).toBe(200);
    expect(runBody.ok).toBe(true);
    expect(detail.task.status).toBe("succeeded");
    expect(detail.task.result_message).toBe("任务完成。");
    expect(detail.task.heartbeat_at).toBeGreaterThan(0);
    expect(detail.task.current_step).toBe("done");
    expect(llmRequests).toHaveLength(1);
    expect(JSON.stringify(llmRequests[0].messages)).toContain("执行一个长任务");
    expect(telegramMessages[0]).toMatchObject({ chat_id: "42", text: "任务完成。" });
  });

  it("supports cancellation and Durable Object alarm fallback for future tasks", async () => {
    const { state, store } = createStore();
    const scheduledAt = Date.now() + 120_000;
    const createRes = await callApi(store, "/api/tasks", {
      method: "POST",
      body: {
        id: "task_alarm",
        message: "未来任务",
        scheduled_at: scheduledAt,
      },
    });
    const created = (await createRes.json()) as any;
    expect(createRes.status).toBe(200);
    expect(created.task.status).toBe("waiting");
    expect(created.enqueue.mode).toBe("durable_object_alarm");
    expect(await state.storage.getAlarm()).toBeGreaterThanOrEqual(scheduledAt);

    const cancelRes = await callApi(store, "/api/tasks/task_alarm/cancel", { method: "POST" });
    const cancelled = (await cancelRes.json()) as any;
    expect(cancelRes.status).toBe(200);
    expect(cancelled.task.status).toBe("cancelled");
  });
});
