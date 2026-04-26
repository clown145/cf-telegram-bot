import { StateStore } from "../../src/state-store";
import { MockDurableObjectState } from "../helpers/mock-do";

interface ApiCallOptions {
  method?: string;
  body?: unknown;
  rawBody?: string;
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
  const body = options.rawBody ?? (options.body === undefined ? undefined : JSON.stringify(options.body));
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

describe("agent config api", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns default agent documents", async () => {
    const { store } = createStore();

    const res = await callApi(store, "/api/agent/config");
    const body = (await res.json()) as any;

    expect(res.status).toBe(200);
    expect(body.enabled).toBe(false);
    expect(body.docs.persona.filename).toBe("persona.md");
    expect(body.docs.memory.content_md).toContain("# 长期记忆");
    expect(body.docs.tasks.content_md).toContain("## 当前目标");
    expect(body.capabilities.can_read_docs).toBe(true);
    expect(body.capabilities.can_write_docs).toBe(true);
  });

  it("updates config and supports reading, writing, appending, and deleting custom docs", async () => {
    const { store } = createStore();

    const saveRes = await callApi(store, "/api/agent/config", {
      method: "PUT",
      body: {
        enabled: true,
        docs: {
          persona: {
            label: "Persona",
            content_md: "# Persona\n\nBe precise.",
          },
          "project-notes": {
            filename: "project-notes.md",
            label: "Project Notes",
            description: "Custom project notes",
            content_md: "# Project Notes",
          },
        },
      },
    });
    const saved = (await saveRes.json()) as any;

    expect(saveRes.status).toBe(200);
    expect(saved.config.enabled).toBe(true);
    expect(saved.config.docs.persona.content_md).toContain("Be precise");
    expect(saved.config.docs["project-notes"].description).toBe("Custom project notes");

    const getDocRes = await callApi(store, "/api/agent/doc/project-notes");
    const getDoc = (await getDocRes.json()) as any;
    expect(getDocRes.status).toBe(200);
    expect(getDoc.doc.content_md).toBe("# Project Notes");

    const putDocRes = await callApi(store, "/api/agent/doc/memory", {
      method: "PUT",
      rawBody: "# Memory\n\nA stable fact.",
      headers: { "Content-Type": "text/markdown" },
    });
    const putDoc = (await putDocRes.json()) as any;
    expect(putDocRes.status).toBe(200);
    expect(putDoc.doc.content_md).toContain("A stable fact");

    const appendRes = await callApi(store, "/api/agent/doc/tasks/append", {
      method: "POST",
      body: {
        heading: "Next",
        text: "- [ ] Add agent runner",
      },
    });
    const appended = (await appendRes.json()) as any;
    expect(appendRes.status).toBe(200);
    expect(appended.doc.content_md).toContain("## Next");
    expect(appended.doc.content_md).toContain("Add agent runner");

    const deleteRes = await callApi(store, "/api/agent/doc/project-notes", { method: "DELETE" });
    const deleted = (await deleteRes.json()) as any;
    expect(deleteRes.status).toBe(200);
    expect(deleted.config.docs["project-notes"]).toBeUndefined();
  });

  it("rejects unknown default agent model ids", async () => {
    const { store } = createStore();

    const res = await callApi(store, "/api/agent/config", {
      method: "PUT",
      body: {
        default_model_id: "missing:model",
      },
    });
    const body = (await res.json()) as any;

    expect(res.status).toBe(400);
    expect(body.error).toContain("LLM model is not enabled");
  });

  it("runs agent chat with document update tools", async () => {
    const toolTurn = {
      type: "tool",
      tool: {
        name: "append_agent_doc",
        arguments: {
          key: "tasks",
          heading: "Agent Runner",
          text: "- [x] Agent chat can update task docs.",
        },
      },
    };
    const finalTurn = {
      type: "final",
      message: "已更新 tasks.md。",
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            model: "gpt-test",
            choices: [{ message: { content: JSON.stringify(toolTurn) }, finish_reason: "stop" }],
            usage: { prompt_tokens: 1, completion_tokens: 1 },
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            model: "gpt-test",
            choices: [{ message: { content: JSON.stringify(finalTurn) }, finish_reason: "stop" }],
            usage: { prompt_tokens: 1, completion_tokens: 1 },
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      );
    vi.stubGlobal("fetch", fetchMock);

    const { state, store } = createStore();
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
    await callApi(store, "/api/agent/config", {
      method: "PUT",
      body: { default_model_id: "provider_1:gpt-test" },
    });

    const res = await callApi(store, "/api/agent/chat", {
      method: "POST",
      body: {
        message: "更新任务",
      },
    });
    const body = (await res.json()) as any;

    expect(res.status).toBe(200);
    expect(body.message).toBe("已更新 tasks.md。");
    expect(body.tool_results[0].tool).toBe("append_agent_doc");
    expect(body.config.docs.tasks.content_md).toContain("Agent chat can update task docs");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe("https://llm.example/v1/chat/completions");
  });
});
