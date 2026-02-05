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
});
