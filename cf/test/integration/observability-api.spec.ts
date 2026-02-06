import { StateStore } from "../../src/state-store";
import { defaultState } from "../../src/utils";
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

async function callApi(
  store: StateStore,
  path: string,
  options: ApiCallOptions = {}
): Promise<Response> {
  const headers = new Headers(options.headers || {});
  if (options.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return await store.fetch(
    new Request(`https://example.com${path}`, {
      method: options.method || "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    })
  );
}

describe("observability api integration", () => {
  it("reads and updates observability config", async () => {
    const { store } = createStore();

    const initialRes = await callApi(store, "/api/observability/config");
    const initialCfg = await initialRes.json<any>();
    expect(initialRes.status).toBe(200);
    expect(initialCfg.enabled).toBe(true);
    expect(initialCfg.keep).toBe(200);

    const updateRes = await callApi(store, "/api/observability/config", {
      method: "PUT",
      body: {
        enabled: false,
        keep: 9999,
        include_runtime: false,
      },
    });
    const updatedCfg = await updateRes.json<any>();
    expect(updateRes.status).toBe(200);
    expect(updatedCfg.enabled).toBe(false);
    expect(updatedCfg.keep).toBe(500);
    expect(updatedCfg.include_runtime).toBe(false);

    const reloadRes = await callApi(store, "/api/observability/config");
    const reloadCfg = await reloadRes.json<any>();
    expect(reloadCfg.enabled).toBe(false);
    expect(reloadCfg.keep).toBe(500);
  });

  it("supports legacy object-shaped observability index", async () => {
    const { state, store } = createStore();
    state.storage.seed("obs:index", {
      legacy_entry: {
        id: "run_legacy",
        workflow_id: "wf_legacy",
        workflow_name: "Legacy Workflow",
        status: "success",
        started_at: 100,
        finished_at: 120,
        duration_ms: 20,
      },
    });

    const listRes = await callApi(store, "/api/observability/executions?limit=10");
    const listData = await listRes.json<any>();
    expect(listRes.status).toBe(200);
    expect(listData.total).toBe(1);
    expect(listData.executions[0].id).toBe("run_legacy");
    expect(listData.executions[0].workflow_id).toBe("wf_legacy");
  });

  it("requires auth token for /api routes when configured", async () => {
    const { store } = createStore({ WEBUI_AUTH_TOKEN: "secret_token" });

    const unauthorizedRes = await callApi(store, "/api/observability/config");
    expect(unauthorizedRes.status).toBe(401);

    const authorizedRes = await callApi(store, "/api/observability/config", {
      headers: { "X-Auth-Token": "secret_token" },
    });
    expect(authorizedRes.status).toBe(200);
  });

  it("runs workflow test endpoint and returns detailed trace", async () => {
    const { state, store } = createStore();
    const model = defaultState("Root");
    model.workflows["wf_test"] = {
      id: "wf_test",
      name: "WF Test",
      nodes: {
        n1: {
          id: "n1",
          action_id: "provide_static_string",
          position: { x: 0, y: 0 },
          data: { value: "hello" },
        },
      },
      edges: [],
    };
    await state.storage.put("state", model);

    const res = await callApi(store, "/api/workflows/wf_test/test", {
      method: "POST",
      body: { preview: true },
    });
    const data = await res.json<any>();
    expect(res.status).toBe(200);
    expect(data.status).toBe("ok");
    expect(data.workflow_id).toBe("wf_test");
    expect(data.preview).toBe(true);
    expect(data.result?.success).toBe(true);
    expect(typeof data.obs_execution_id).toBe("string");
    expect(data.trace?.id).toBe(data.obs_execution_id);
    expect(data.trace?.workflow_id).toBe("wf_test");
    expect(Array.isArray(data.trace?.nodes)).toBe(true);
    expect(data.trace?.nodes?.[0]?.action_id).toBe("provide_static_string");
  });

  it("runs command trigger test mode and executes matching trigger branch", async () => {
    const { state, store } = createStore();
    const model = defaultState("Root");
    model.workflows["wf_trigger"] = {
      id: "wf_trigger",
      name: "WF Trigger",
      nodes: {
        c1: {
          id: "c1",
          action_id: "trigger_command",
          position: { x: 0, y: 0 },
          data: { enabled: true, priority: 100, command: "cs", args_mode: "auto" },
        },
        k1: {
          id: "k1",
          action_id: "trigger_keyword",
          position: { x: 0, y: 0 },
          data: { enabled: true, priority: 50, keywords: "你好", match_mode: "contains" },
        },
        n_cmd: {
          id: "n_cmd",
          action_id: "provide_static_string",
          position: { x: 0, y: 0 },
          data: { value: "from command" },
        },
        n_kw: {
          id: "n_kw",
          action_id: "provide_static_string",
          position: { x: 0, y: 0 },
          data: { value: "from keyword" },
        },
      },
      edges: [
        {
          id: "e1",
          source_node: "c1",
          source_output: "output",
          target_node: "n_cmd",
          target_input: "input",
        },
        {
          id: "e2",
          source_node: "k1",
          source_output: "output",
          target_node: "n_kw",
          target_input: "input",
        },
      ],
    };
    await state.storage.put("state", model);

    const res = await callApi(store, "/api/workflows/wf_trigger/test", {
      method: "POST",
      body: {
        preview: true,
        trigger_mode: "command",
        command_text: "/cs hello",
      },
    });
    const data = await res.json<any>();
    expect(res.status).toBe(200);
    expect(data.trigger_mode).toBe("command");
    expect(data.trigger_match?.node_id).toBe("c1");
    expect(data.result?.success).toBe(true);
    expect(Array.isArray(data.trace?.nodes)).toBe(true);
    const actionIds = (data.trace?.nodes || []).map((node: any) => node.action_id);
    expect(actionIds).toContain("trigger_command");
    expect(actionIds).toContain("provide_static_string");
    expect(actionIds).not.toContain("trigger_keyword");
  });

  it("returns 400 when keyword trigger test does not match", async () => {
    const { state, store } = createStore();
    const model = defaultState("Root");
    model.workflows["wf_keyword"] = {
      id: "wf_keyword",
      name: "WF Keyword",
      nodes: {
        k1: {
          id: "k1",
          action_id: "trigger_keyword",
          position: { x: 0, y: 0 },
          data: { enabled: true, priority: 50, keywords: "你好", match_mode: "contains" },
        },
      },
      edges: [],
    };
    await state.storage.put("state", model);

    const res = await callApi(store, "/api/workflows/wf_keyword/test", {
      method: "POST",
      body: {
        preview: true,
        trigger_mode: "keyword",
        message_text: "abc",
      },
    });
    const data = await res.json<any>();
    expect(res.status).toBe(400);
    expect(String(data.error || "")).toContain("no keyword trigger matched");
  });

  it("runs button trigger test mode and executes matching trigger branch", async () => {
    const { state, store } = createStore();
    const model = defaultState("Root");
    model.buttons["btn_test"] = {
      id: "btn_test",
      text: "Test Button",
      type: "workflow",
      payload: { workflow_id: "wf_button" },
    };
    model.menus.root.items = ["btn_test"];
    model.workflows["wf_button"] = {
      id: "wf_button",
      name: "WF Button",
      nodes: {
        b1: {
          id: "b1",
          action_id: "trigger_button",
          position: { x: 0, y: 0 },
          data: {
            enabled: true,
            priority: 100,
            button_id: "btn_test",
            menu_id: "root",
          },
        },
        n1: {
          id: "n1",
          action_id: "provide_static_string",
          position: { x: 0, y: 0 },
          data: { value: "from button" },
        },
      },
      edges: [
        {
          id: "e1",
          source_node: "b1",
          source_output: "output",
          target_node: "n1",
          target_input: "input",
        },
      ],
    };
    await state.storage.put("state", model);

    const res = await callApi(store, "/api/workflows/wf_button/test", {
      method: "POST",
      body: {
        preview: true,
        trigger_mode: "button",
        button_id: "btn_test",
      },
    });
    const data = await res.json<any>();
    expect(res.status).toBe(200);
    expect(data.trigger_mode).toBe("button");
    expect(data.trigger_match?.node_id).toBe("b1");
    expect(data.result?.success).toBe(true);
    const actionIds = (data.trace?.nodes || []).map((node: any) => node.action_id);
    expect(actionIds).toContain("trigger_button");
  });

  it("returns pending result for await_user_input workflow test", async () => {
    const { state, store } = createStore();
    const model = defaultState("Root");
    model.workflows["wf_pending"] = {
      id: "wf_pending",
      name: "WF Pending",
      nodes: {
        a1: {
          id: "a1",
          action_id: "await_user_input",
          position: { x: 0, y: 0 },
          data: {
            prompt_template: "请输入内容",
            timeout_seconds: 30,
            allow_empty: false,
          },
        },
      },
      edges: [],
    };
    await state.storage.put("state", model);

    const res = await callApi(store, "/api/workflows/wf_pending/test", {
      method: "POST",
      body: { preview: true },
    });
    const data = await res.json<any>();
    expect(res.status).toBe(200);
    expect(data.result?.pending).toBeTruthy();
    expect(data.trace?.status).toBe("pending");
  });

  it("supports generic trigger mode for future trigger node types", async () => {
    const { state, store } = createStore();
    const model = defaultState("Root");
    model.workflows["wf_future_trigger"] = {
      id: "wf_future_trigger",
      name: "WF Future Trigger",
      nodes: {
        t1: {
          id: "t1",
          action_id: "trigger_message",
          position: { x: 0, y: 0 },
          data: {
            enabled: true,
            priority: 80,
          },
        },
        n1: {
          id: "n1",
          action_id: "provide_static_string",
          position: { x: 0, y: 0 },
          data: { value: "future trigger path" },
        },
      },
      edges: [
        {
          id: "e1",
          source_node: "t1",
          source_output: "output",
          target_node: "n1",
          target_input: "input",
        },
      ],
    };
    await state.storage.put("state", model);

    const res = await callApi(store, "/api/workflows/wf_future_trigger/test", {
      method: "POST",
      body: {
        preview: true,
        trigger_mode: "message",
      },
    });
    const data = await res.json<any>();
    expect(res.status).toBe(200);
    expect(data.trigger_mode).toBe("message");
    expect(data.trigger_match?.node_id).toBe("t1");
    expect(data.trigger_candidates).toBe(1);
  });

  it("captures failure snapshot when workflow execution fails", async () => {
    const { state, store } = createStore();
    const model = defaultState("Root");
    model.workflows["wf_fail_snapshot"] = {
      id: "wf_fail_snapshot",
      name: "WF Fail Snapshot",
      nodes: {
        bad1: {
          id: "bad1",
          action_id: "missing_action_for_test",
          position: { x: 0, y: 0 },
          data: {},
        },
      },
      edges: [],
    };
    await state.storage.put("state", model);

    const res = await callApi(store, "/api/workflows/wf_fail_snapshot/test", {
      method: "POST",
      body: { preview: true },
    });
    const data = await res.json<any>();
    expect(res.status).toBe(200);
    expect(data.result?.success).toBe(false);
    expect(data.trace?.status).toBe("error");
    expect(data.trace?.failure_snapshot?.source).toBe("node");
    expect(data.trace?.failure_snapshot?.node_id).toBe("bad1");
    expect(data.trace?.failure_snapshot?.action_id).toBe("missing_action_for_test");
    expect(String(data.trace?.failure_snapshot?.error || "")).not.toBe("");
  });

  it("returns observability stats and respects workflow scope", async () => {
    const { state, store } = createStore();
    const model = defaultState("Root");
    model.workflows["wf_ok_stats"] = {
      id: "wf_ok_stats",
      name: "WF OK Stats",
      nodes: {
        n1: {
          id: "n1",
          action_id: "provide_static_string",
          position: { x: 0, y: 0 },
          data: { value: "ok" },
        },
      },
      edges: [],
    };
    model.workflows["wf_err_stats"] = {
      id: "wf_err_stats",
      name: "WF ERR Stats",
      nodes: {
        b1: {
          id: "b1",
          action_id: "missing_action_for_stats",
          position: { x: 0, y: 0 },
          data: {},
        },
      },
      edges: [],
    };
    await state.storage.put("state", model);

    const okRes = await callApi(store, "/api/workflows/wf_ok_stats/test", {
      method: "POST",
      body: { preview: true },
    });
    expect(okRes.status).toBe(200);
    const errRes = await callApi(store, "/api/workflows/wf_err_stats/test", {
      method: "POST",
      body: { preview: true },
    });
    expect(errRes.status).toBe(200);

    const allRes = await callApi(store, "/api/observability/executions?limit=50");
    const allData = await allRes.json<any>();
    expect(allRes.status).toBe(200);
    expect(allData.total).toBe(2);
    expect(allData.stats?.scope_total).toBe(2);
    expect(allData.stats?.success_count).toBe(1);
    expect(allData.stats?.error_count).toBe(1);
    expect(allData.stats?.success_rate).toBe(50);
    expect(typeof allData.stats?.avg_duration_ms === "number" || allData.stats?.avg_duration_ms === null).toBe(true);

    const scopedRes = await callApi(store, "/api/observability/executions?workflow_id=wf_ok_stats&limit=50");
    const scopedData = await scopedRes.json<any>();
    expect(scopedRes.status).toBe(200);
    expect(scopedData.total).toBe(1);
    expect(scopedData.stats?.scope_total).toBe(1);
    expect(scopedData.stats?.success_count).toBe(1);
    expect(scopedData.stats?.error_count).toBe(0);
    expect(scopedData.stats?.success_rate).toBe(100);
  });

  it("returns null trace when observability is disabled", async () => {
    const { state, store } = createStore();
    const model = defaultState("Root");
    model.workflows["wf_obs_off"] = {
      id: "wf_obs_off",
      name: "WF Obs Off",
      nodes: {
        n1: {
          id: "n1",
          action_id: "provide_static_string",
          position: { x: 0, y: 0 },
          data: { value: "hello" },
        },
      },
      edges: [],
    };
    await state.storage.put("state", model);

    const cfgRes = await callApi(store, "/api/observability/config", {
      method: "PUT",
      body: {
        enabled: false,
        keep: 200,
      },
    });
    expect(cfgRes.status).toBe(200);

    const res = await callApi(store, "/api/workflows/wf_obs_off/test", {
      method: "POST",
      body: { preview: true },
    });
    const data = await res.json<any>();
    expect(res.status).toBe(200);
    expect(data.observability_enabled).toBe(false);
    expect(data.obs_execution_id).toBeNull();
    expect(data.trace).toBeNull();
    expect(data.result?.success).toBe(true);
  });

  it("rejects webhook when secret token does not match", async () => {
    const { store } = createStore();
    const saveRes = await callApi(store, "/api/bot/config", {
      method: "PUT",
      body: {
        token: "",
        webhook_url: "",
        webhook_secret: "test_secret",
        commands: [],
      },
    });
    expect(saveRes.status).toBe(200);

    const deniedRes = await callApi(store, "/telegram/webhook", {
      method: "POST",
      body: { update_id: 1 },
    });
    expect(deniedRes.status).toBe(403);

    const acceptedRes = await callApi(store, "/telegram/webhook", {
      method: "POST",
      headers: { "X-Telegram-Bot-Api-Secret-Token": "test_secret" },
      body: { update_id: 2 },
    });
    expect(acceptedRes.status).toBe(200);
  });

  it("binds webhook with callback_query in default allowed_updates", async () => {
    const { store } = createStore();
    const calls: Array<{ url: string; method: string; body: unknown }> = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      let body: unknown = null;
      if (typeof init?.body === "string") {
        try {
          body = JSON.parse(init.body);
        } catch {
          body = init.body;
        }
      }
      calls.push({
        url,
        method: String(init?.method || "GET").toUpperCase(),
        body,
      });
      return new Response(JSON.stringify({ ok: true, result: { webhook: true } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock as any);
    try {
      const saveRes = await callApi(store, "/api/bot/config", {
        method: "PUT",
        body: {
          token: "",
          webhook_url: "https://example.com/telegram/webhook",
          webhook_secret: "",
          commands: [],
        },
      });
      expect(saveRes.status).toBe(200);
    } finally {
      vi.unstubAllGlobals();
    }

    const setWebhookCall = calls.find((entry) => entry.url.endsWith("/setWebhook"));
    expect(setWebhookCall).toBeTruthy();
    expect(setWebhookCall?.method).toBe("POST");
    const payload = (setWebhookCall?.body || {}) as Record<string, unknown>;
    const allowedUpdates = Array.isArray(payload.allowed_updates) ? payload.allowed_updates.map(String) : [];
    expect(allowedUpdates).toContain("message");
    expect(allowedUpdates).toContain("callback_query");
  });

  it("enforces webhook rate limit per client ip", async () => {
    const { store } = createStore({
      WEBHOOK_RATE_LIMIT_PER_MINUTE: "1",
      WEBHOOK_RATE_LIMIT_WINDOW_SECONDS: "60",
    });
    const headers = { "CF-Connecting-IP": "203.0.113.10" };

    const first = await callApi(store, "/telegram/webhook", {
      method: "POST",
      headers,
      body: { update_id: 100 },
    });
    expect(first.status).toBe(200);

    const second = await callApi(store, "/telegram/webhook", {
      method: "POST",
      headers,
      body: { update_id: 101 },
    });
    expect(second.status).toBe(429);
    expect(Number(second.headers.get("Retry-After"))).toBeGreaterThan(0);
  });

  it("handles inline_query/chat_member/my_chat_member trigger workflows", async () => {
    const { state, store } = createStore();
    const model = defaultState("Root");
    model.workflows["wf_inline"] = {
      id: "wf_inline",
      name: "WF Inline",
      nodes: {
        t1: {
          id: "t1",
          action_id: "trigger_inline_query",
          position: { x: 0, y: 0 },
          data: { enabled: true, priority: 100, query_pattern: "", match_mode: "contains" },
        },
        n1: {
          id: "n1",
          action_id: "provide_static_string",
          position: { x: 0, y: 0 },
          data: { value: "inline ok" },
        },
      },
      edges: [
        {
          id: "e1",
          source_node: "t1",
          source_output: "output",
          target_node: "n1",
          target_input: "input",
        },
      ],
    };
    model.workflows["wf_chat_member"] = {
      id: "wf_chat_member",
      name: "WF Chat Member",
      nodes: {
        t2: {
          id: "t2",
          action_id: "trigger_chat_member",
          position: { x: 0, y: 0 },
          data: { enabled: true, priority: 100, from_status: "", to_status: "", chat_type: "" },
        },
        n2: {
          id: "n2",
          action_id: "provide_static_string",
          position: { x: 0, y: 0 },
          data: { value: "chat member ok" },
        },
      },
      edges: [
        {
          id: "e2",
          source_node: "t2",
          source_output: "output",
          target_node: "n2",
          target_input: "input",
        },
      ],
    };
    model.workflows["wf_my_chat_member"] = {
      id: "wf_my_chat_member",
      name: "WF My Chat Member",
      nodes: {
        t3: {
          id: "t3",
          action_id: "trigger_my_chat_member",
          position: { x: 0, y: 0 },
          data: { enabled: true, priority: 100, from_status: "", to_status: "", chat_type: "" },
        },
        n3: {
          id: "n3",
          action_id: "provide_static_string",
          position: { x: 0, y: 0 },
          data: { value: "my chat member ok" },
        },
      },
      edges: [
        {
          id: "e3",
          source_node: "t3",
          source_output: "output",
          target_node: "n3",
          target_input: "input",
        },
      ],
    };
    await state.storage.put("state", model);

    const inlineRes = await callApi(store, "/telegram/webhook", {
      method: "POST",
      body: {
        update_id: 2001,
        inline_query: {
          id: "iq_1",
          from: { id: 101, is_bot: false, first_name: "Inline" },
          query: "hello",
          offset: "",
        },
      },
    });
    expect(inlineRes.status).toBe(200);

    const chatMemberRes = await callApi(store, "/telegram/webhook", {
      method: "POST",
      body: {
        update_id: 2002,
        chat_member: {
          chat: { id: -1001, type: "supergroup", title: "Test Group" },
          from: { id: 202, is_bot: false, first_name: "Admin" },
          date: 1770322540,
          old_chat_member: { user: { id: 303 }, status: "left" },
          new_chat_member: { user: { id: 303 }, status: "member" },
        },
      },
    });
    expect(chatMemberRes.status).toBe(200);

    const myChatMemberRes = await callApi(store, "/telegram/webhook", {
      method: "POST",
      body: {
        update_id: 2003,
        my_chat_member: {
          chat: { id: -1002, type: "group", title: "Another Group" },
          from: { id: 404, is_bot: false, first_name: "Owner" },
          date: 1770322541,
          old_chat_member: { user: { id: 505 }, status: "left" },
          new_chat_member: { user: { id: 505 }, status: "member" },
        },
      },
    });
    expect(myChatMemberRes.status).toBe(200);

    await state.drainWaitUntil();

    const listRes = await callApi(store, "/api/observability/executions?limit=20");
    const listData = await listRes.json<any>();
    expect(listRes.status).toBe(200);
    const triggerTypes = (listData.executions || []).map((entry: any) => entry.trigger_type);
    expect(triggerTypes).toContain("inline_query");
    expect(triggerTypes).toContain("chat_member");
    expect(triggerTypes).toContain("my_chat_member");
  });

  it("applies node timeout and retry policy during workflow test", async () => {
    const { state, store } = createStore();
    const model = defaultState("Root");
    model.workflows["wf_timeout_retry"] = {
      id: "wf_timeout_retry",
      name: "WF Timeout Retry",
      nodes: {
        d1: {
          id: "d1",
          action_id: "delay",
          position: { x: 0, y: 0 },
          data: {
            delay_ms: 20,
            __timeout_ms: 1,
            __retry_count: 1,
            __retry_delay_ms: 0,
          },
        },
      },
      edges: [],
    };
    await state.storage.put("state", model);

    const res = await callApi(store, "/api/workflows/wf_timeout_retry/test", {
      method: "POST",
      body: { preview: true },
    });
    const data = await res.json<any>();
    expect(res.status).toBe(200);
    expect(data.result?.success).toBe(false);
    expect(String(data.result?.error || "")).toContain("after 2 attempts");
    expect(data.trace?.status).toBe("error");
  });
});
