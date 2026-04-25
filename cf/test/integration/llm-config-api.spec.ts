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

describe("llm config api", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("stores providers without returning API keys", async () => {
    const { store } = createStore();

    const createRes = await callApi(store, "/api/llm/providers", {
      method: "POST",
      body: {
        name: "OpenAI",
        type: "openai",
        base_url: "https://llm.example/v1",
        api_key: "secret-key",
        enabled: true,
      },
    });
    const created = (await createRes.json()) as any;
    expect(createRes.status).toBe(200);
    expect(created.provider_id).toMatch(/^llm_/);
    expect(created.config.providers[created.provider_id].api_key).toBe("");
    expect(created.config.providers[created.provider_id].has_api_key).toBe(true);
    expect(JSON.stringify(created)).not.toContain("secret-key");

    const reloadRes = await callApi(store, "/api/llm/config");
    const reloaded = (await reloadRes.json()) as any;
    expect(JSON.stringify(reloaded)).not.toContain("secret-key");
    expect(reloaded.providers[created.provider_id].has_api_key).toBe(true);
  });

  it("fetches OpenAI-compatible models and exposes enabled models as node options", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          data: [{ id: "gpt-test" }, { id: "gpt-test-mini" }],
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const { state, store } = createStore();
    await state.storage.put("state", defaultState("Root"));

    const createRes = await callApi(store, "/api/llm/providers", {
      method: "POST",
      body: {
        id: "provider_1",
        name: "OpenAI",
        type: "openai",
        base_url: "https://llm.example/v1",
        api_key: "secret-key",
        enabled: true,
      },
    });
    expect(createRes.status).toBe(200);

    const fetchRes = await callApi(store, "/api/llm/providers/provider_1/fetch-models", {
      method: "POST",
    });
    const fetched = (await fetchRes.json()) as any;
    expect(fetchRes.status).toBe(200);
    expect(fetched.fetched).toBe(2);
    expect(fetched.models.map((model: any) => model.model)).toEqual(["gpt-test", "gpt-test-mini"]);
    expect(Object.keys(fetched.config.models)).toEqual([]);
    expect(fetchMock).toHaveBeenCalledWith("https://llm.example/v1/models", {
      method: "GET",
      headers: { authorization: "Bearer secret-key" },
    });

    const modelId = "provider_1:gpt-test";
    const updateRes = await callApi(store, "/api/llm/models", {
      method: "PUT",
      body: {
        models: [
          {
            id: modelId,
            provider_id: "provider_1",
            model: "gpt-test",
            enabled: true,
            name: "GPT Test",
          },
          {
            id: "provider_1:gpt-test-mini",
            provider_id: "provider_1",
            model: "gpt-test-mini",
            enabled: false,
            name: "GPT Test Mini",
          },
        ],
      },
    });
    expect(updateRes.status).toBe(200);
    const updated = (await updateRes.json()) as any;
    expect(Object.keys(updated.config.models)).toEqual([modelId]);

    const actionsRes = await callApi(store, "/api/actions/modular/available");
    const actions = (await actionsRes.json()) as any;
    const llmGenerate = actions.actions.find((action: any) => action.id === "llm_generate");
    expect(llmGenerate.category).toBe("ai");
    const llmModelInput = llmGenerate.inputs.find((input: any) => input.name === "llm_model");
    expect(llmModelInput.options).toEqual([{ value: modelId, label: "OpenAI / GPT Test" }]);
    expect(actions.categories.some((category: any) => category.key === "ai")).toBe(true);
    const rootPack = actions.skill_packs.find((pack: any) => pack.key === "workflow-nodes");
    expect(rootPack.tools.some((tool: any) => tool.id === "llm_generate")).toBe(true);
    expect(rootPack.files.some((file: any) => file.path === "workflow-nodes/ai/llm_generate.md")).toBe(true);
  });

  it("fetches Gemini models and preserves provider keys on blank update", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          models: [
            {
              name: "models/gemini-test",
              displayName: "Gemini Test",
              supportedGenerationMethods: ["generateContent"],
            },
            {
              name: "models/embed-test",
              displayName: "Embed Test",
              supportedGenerationMethods: ["embedContent"],
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const { store } = createStore();
    const createRes = await callApi(store, "/api/llm/providers", {
      method: "POST",
      body: {
        id: "gemini_provider",
        name: "Gemini",
        type: "gemini",
        api_key: "gemini-secret",
      },
    });
    expect(createRes.status).toBe(200);

    const updateRes = await callApi(store, "/api/llm/providers", {
      method: "POST",
      body: {
        id: "gemini_provider",
        name: "Gemini Updated",
        type: "gemini",
        api_key: "",
      },
    });
    const updated = (await updateRes.json()) as any;
    expect(updated.config.providers.gemini_provider.has_api_key).toBe(true);
    expect(JSON.stringify(updated)).not.toContain("gemini-secret");

    const fetchRes = await callApi(store, "/api/llm/providers/gemini_provider/fetch-models", {
      method: "POST",
    });
    const fetched = (await fetchRes.json()) as any;
    expect(fetchRes.status).toBe(200);
    expect(fetched.fetched).toBe(1);
    expect(fetched.models.map((model: any) => model.model)).toEqual(["models/gemini-test"]);
    expect(Object.keys(fetched.config.models)).toEqual([]);
    expect(String((fetchMock.mock.calls as unknown[][])[0]?.[0])).toContain("key=gemini-secret");
  });
});
