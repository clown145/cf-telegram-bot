import { afterEach, vi } from "vitest";
import { StateStore } from "../../src/state-store";
import { defaultState } from "../../src/utils";
import type { ButtonsModel } from "../../src/types";
import { MockDurableObjectState } from "../helpers/mock-do";

function createWorkflowButtonState(): ButtonsModel {
  const model = defaultState("Main Menu");
  model.buttons["btn_wf"] = {
    id: "btn_wf",
    text: "Run workflow",
    type: "workflow",
    payload: {
      workflow_id: "wf_demo",
    },
  };
  model.menus.root.items = ["btn_wf"];
  model.workflows["wf_demo"] = {
    id: "wf_demo",
    name: "Workflow Demo",
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
  return model;
}

function installTelegramMock() {
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
    return new Response(
      JSON.stringify({
        ok: true,
        result: {
          message_id: 99,
        },
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  });
  vi.stubGlobal("fetch", fetchMock as any);
  return { calls };
}

async function call(
  store: StateStore,
  path: string,
  method = "GET",
  body?: unknown
): Promise<Response> {
  return await store.fetch(
    new Request(`https://example.com${path}`, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("telegram webhook e2e", () => {
  it("captures workflow button execution into observability logs", async () => {
    const { calls } = installTelegramMock();
    const state = new MockDurableObjectState();
    await state.storage.put("state", createWorkflowButtonState());

    const store = new StateStore(state as any, {
      TELEGRAM_BOT_TOKEN: "test_token",
      WEBUI_AUTH_TOKEN: "",
    } as any);

    const update = {
      update_id: 101,
      callback_query: {
        id: "cbq_1",
        from: {
          id: 321,
          is_bot: false,
          first_name: "Tester",
        },
        data: "tgbtn:wf:btn_wf",
        message: {
          message_id: 77,
          text: "Main Menu",
          chat: {
            id: 654,
            type: "private",
          },
        },
      },
    };

    const webhookRes = await call(store, "/telegram/webhook", "POST", update);
    expect(webhookRes.status).toBe(200);
    await state.drainWaitUntil();

    const listRes = await call(store, "/api/observability/executions?limit=10");
    const listData = await listRes.json<any>();
    expect(listRes.status).toBe(200);
    expect(listData.total).toBe(1);
    expect(listData.executions[0].status).toBe("success");
    expect(listData.executions[0].trigger_type).toBe("button");
    expect(listData.executions[0].workflow_id).toBe("wf_demo");

    const detailId = listData.executions[0].id;
    const detailRes = await call(
      store,
      `/api/observability/executions/${encodeURIComponent(detailId)}`
    );
    const detailData = await detailRes.json<any>();
    expect(detailRes.status).toBe(200);
    expect(detailData.id).toBe(detailId);
    expect(detailData.status).toBe("success");
    expect(Array.isArray(detailData.nodes)).toBe(true);
    expect(detailData.nodes.length).toBe(1);
    expect(detailData.nodes[0].action_id).toBe("provide_static_string");

    const telegramMethods = calls.map((entry) => entry.url.split("/").pop());
    expect(telegramMethods).toContain("answerCallbackQuery");
    expect(telegramMethods).toContain("editMessageText");
  });
});
