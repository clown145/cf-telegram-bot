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
    ALLOW_INSECURE_API: "true",
    TELEGRAM_BOT_TOKEN: "test_token",
    ...envOverrides,
  };
  const store = new StateStore(state as any, env as any);
  return { state, store };
}

async function callApi(store: StateStore, path: string, options: ApiCallOptions = {}): Promise<Response> {
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

describe("workflow versions api", () => {
  it("records workflow saves and rolls back to a previous snapshot", async () => {
    const { state, store } = createStore();
    await state.storage.put("state", defaultState("Root"));

    const initialWorkflow = {
      id: "wf_versioned",
      name: "Versioned Workflow",
      description: "Initial",
      nodes: {},
      edges: [],
    };
    const createRes = await callApi(store, "/api/workflows/wf_versioned", {
      method: "PUT",
      body: initialWorkflow,
    });
    const created = (await createRes.json()) as any;
    expect(createRes.status).toBe(200);
    expect(created.version_created.snapshot_exists).toBe(false);

    const editedWorkflow = {
      ...initialWorkflow,
      name: "Edited Workflow",
      nodes: {
        n1: {
          id: "n1",
          action_id: "send_message",
          position: { x: 100, y: 100 },
          data: { text: "hello" },
        },
      },
    };
    const editRes = await callApi(store, "/api/workflows/wf_versioned", {
      method: "PUT",
      body: editedWorkflow,
    });
    const edited = (await editRes.json()) as any;
    expect(editRes.status).toBe(200);
    expect(edited.version_created.snapshot_name).toBe("Versioned Workflow");

    const versionsRes = await callApi(store, "/api/workflows/wf_versioned/versions");
    const versions = (await versionsRes.json()) as any;
    expect(versionsRes.status).toBe(200);
    expect(versions.total).toBe(2);
    const target = versions.versions.find((version: any) => version.operation === "api_replace_workflow");
    expect(target.snapshot_node_count).toBe(0);

    const rollbackRes = await callApi(store, "/api/workflows/wf_versioned/rollback", {
      method: "POST",
      body: {
        version_id: target.version_id,
        reason: "undo edit",
      },
    });
    const rollback = (await rollbackRes.json()) as any;
    expect(rollbackRes.status).toBe(200);
    expect(rollback.workflow.name).toBe("Versioned Workflow");
    expect(Object.keys(rollback.workflow.nodes)).toEqual([]);

    const afterVersionsRes = await callApi(store, "/api/workflows/wf_versioned/versions");
    const afterVersions = (await afterVersionsRes.json()) as any;
    expect(afterVersions.total).toBe(3);
    expect(afterVersions.versions[0].operation).toBe("rollback_workflow");
    expect(afterVersions.versions[0].snapshot_name).toBe("Edited Workflow");
  });
});
