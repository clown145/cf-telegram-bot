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

describe("telegram workflow dispatch", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("queues Telegram webhook updates into Cloudflare Workflows when the binding exists", async () => {
    const createWorkflow = vi.fn(async (options: any) => ({ id: options.id }));
    const { state, store } = createStore({
      TELEGRAM_UPDATE_WORKFLOW: {
        create: createWorkflow,
      },
    });

    const res = await callApi(store, "/telegram/webhook", {
      method: "POST",
      body: {
        update_id: 123,
        message: {
          message_id: 1,
          chat: { id: 42, type: "private" },
          from: { id: 7 },
          text: "/start",
        },
      },
    });
    const body = (await res.json()) as any;
    await state.drainWaitUntil();

    expect(res.status).toBe(200);
    expect(body.background).toBe("cloudflare_workflows");
    expect(body.instance_id).toBe("tg-123");
    expect(createWorkflow).toHaveBeenCalledTimes(1);
    expect(createWorkflow.mock.calls[0][0]).toMatchObject({
      id: "tg-123",
      params: {
        update: {
          update_id: 123,
        },
      },
    });
  });

  it("falls back to waitUntil when the Workflow binding is unavailable", async () => {
    const telegramMessages: any[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        const body = typeof init?.body === "string" ? JSON.parse(init.body) : {};
        telegramMessages.push(body);
        return new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      })
    );

    const { state, store } = createStore();
    const res = await callApi(store, "/telegram/webhook", {
      method: "POST",
      body: {
        update_id: 124,
        message: {
          message_id: 2,
          chat: { id: 42, type: "private" },
          from: { id: 7 },
          text: "/start",
        },
      },
    });
    const body = (await res.json()) as any;
    await state.drainWaitUntil();

    expect(res.status).toBe(200);
    expect(body.background).toBe("waitUntil");
    expect(telegramMessages).toHaveLength(1);
    expect(telegramMessages[0]).toMatchObject({ chat_id: "42" });
  });

  it("lets the Cloudflare Workflow process a queued update through the internal route", async () => {
    const telegramMessages: any[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        const body = typeof init?.body === "string" ? JSON.parse(init.body) : {};
        telegramMessages.push(body);
        return new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      })
    );

    const { store } = createStore();
    const blocked = await callApi(store, "/internal/telegram/process", {
      method: "POST",
      body: { update: { update_id: 125 } },
    });
    expect(blocked.status).toBe(403);

    const res = await callApi(store, "/internal/telegram/process", {
      method: "POST",
      headers: { "X-CF-Telegram-Bot-Internal": "workflow" },
      body: {
        update: {
          update_id: 125,
          message: {
            message_id: 3,
            chat: { id: 42, type: "private" },
            from: { id: 7 },
            text: "/start",
          },
        },
      },
    });
    const body = (await res.json()) as any;

    expect(res.status).toBe(200);
    expect(body.status).toBe("ok");
    expect(body.update_id).toBe(125);
    expect(telegramMessages).toHaveLength(1);
    expect(telegramMessages[0]).toMatchObject({ chat_id: "42" });
  });
});
