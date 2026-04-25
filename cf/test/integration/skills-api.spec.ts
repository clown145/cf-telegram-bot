import { StateStore } from "../../src/state-store";
import { defaultState } from "../../src/utils";
import { MockDurableObjectState } from "../helpers/mock-do";

interface ApiCallOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
}

function createStore() {
  const state = new MockDurableObjectState();
  const env = {
    WEBUI_AUTH_TOKEN: "",
    TELEGRAM_BOT_TOKEN: "test_token",
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

describe("skills api", () => {
  it("lists generated skill packs", async () => {
    const { state, store } = createStore();
    await state.storage.put("state", defaultState("Root"));

    const res = await callApi(store, "/api/actions/skills/available");
    const body = (await res.json()) as any;

    expect(res.status).toBe(200);
    expect(body.categories.some((category: any) => category.key === "ai")).toBe(true);
    const aiPack = body.skill_packs.find((pack: any) => pack.key === "ai");
    expect(aiPack.custom).toBeUndefined();
    expect(aiPack.tools.some((tool: any) => tool.id === "llm_generate")).toBe(true);
  });

  it("uploads and deletes skill pack metadata that references existing nodes", async () => {
    const { state, store } = createStore();
    await state.storage.put("state", defaultState("Root"));

    const uploadRes = await callApi(store, "/api/actions/skills/upload", {
      method: "POST",
      body: {
        key: "message_ai_compose",
        label: "Message AI Compose",
        description: "Expose message and LLM tools together.",
        category: "ai",
        tool_ids: ["llm_generate", "send_message", "edit_message_text"],
      },
    });
    const uploaded = (await uploadRes.json()) as any;

    expect(uploadRes.status).toBe(200);
    const customPack = uploaded.skill_packs.find((pack: any) => pack.key === "message_ai_compose");
    expect(customPack.custom).toBe(true);
    expect(customPack.source).toBe("uploaded");
    expect(customPack.tools.map((tool: any) => tool.id)).toEqual([
      "llm_generate",
      "send_message",
      "edit_message_text",
    ]);

    const reloadRes = await callApi(store, "/api/actions/skills/available");
    const reloaded = (await reloadRes.json()) as any;
    expect(reloaded.skill_packs.some((pack: any) => pack.key === "message_ai_compose")).toBe(true);

    const deleteRes = await callApi(store, "/api/actions/skills/message_ai_compose", {
      method: "DELETE",
    });
    const deleted = (await deleteRes.json()) as any;

    expect(deleteRes.status).toBe(200);
    expect(deleted.skill_packs.some((pack: any) => pack.key === "message_ai_compose")).toBe(false);
  });

  it("rejects uploaded skill packs that reference unknown node ids", async () => {
    const { state, store } = createStore();
    await state.storage.put("state", defaultState("Root"));

    const res = await callApi(store, "/api/actions/skills/upload", {
      method: "POST",
      body: {
        key: "bad_pack",
        label: "Bad Pack",
        tool_ids: ["missing_node"],
      },
    });
    const body = (await res.json()) as any;

    expect(res.status).toBe(400);
    expect(body.details.unknown_tool_ids).toEqual(["missing_node"]);
  });
});
