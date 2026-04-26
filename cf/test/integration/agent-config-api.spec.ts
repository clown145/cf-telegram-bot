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
    expect(body.allow_node_execution).toBe(false);
    expect(body.max_tool_rounds).toBe(5);
    expect(body.disabled_skill_keys).toEqual([]);
    expect(body.telegram_command_enabled).toBe(true);
    expect(body.telegram_private_chat_enabled).toBe(false);
    expect(body.capabilities.can_read_docs).toBe(true);
    expect(body.capabilities.can_write_docs).toBe(true);
    expect(body.capabilities.can_execute_node_tools).toBe(false);
    expect(body.capabilities.max_tool_rounds).toBe(5);
  });

  it("updates config and supports reading, writing, appending, and deleting custom docs", async () => {
    const { store } = createStore();

    const saveRes = await callApi(store, "/api/agent/config", {
      method: "PUT",
      body: {
        enabled: true,
        max_tool_rounds: 7,
        disabled_skill_keys: ["workflow-nodes"],
        telegram_command_enabled: false,
        telegram_private_chat_enabled: true,
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
    expect(saved.config.allow_node_execution).toBe(false);
    expect(saved.config.max_tool_rounds).toBe(7);
    expect(saved.config.disabled_skill_keys).toEqual(["workflow-nodes"]);
    expect(saved.config.telegram_command_enabled).toBe(false);
    expect(saved.config.telegram_private_chat_enabled).toBe(true);
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
    const appendArgs = {
      key: "tasks",
      heading: "Agent Runner",
      text: "- [x] Agent chat can update task docs.",
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            model: "gpt-test",
            choices: [
              {
                message: {
                  role: "assistant",
                  content: null,
                  tool_calls: [
                    {
                      id: "call_1",
                      type: "function",
                      function: {
                        name: "append_agent_doc",
                        arguments: JSON.stringify(appendArgs),
                      },
                    },
                  ],
                },
                finish_reason: "tool_calls",
              },
            ],
            usage: { prompt_tokens: 1, completion_tokens: 1 },
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            model: "gpt-test",
            choices: [{ message: { role: "assistant", content: "已更新 tasks.md。" }, finish_reason: "stop" }],
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
    const firstBody = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body));
    expect(firstBody.tools.some((tool: any) => tool.function?.name === "append_agent_doc")).toBe(true);
    const secondBody = JSON.parse(String((fetchMock.mock.calls[1]?.[1] as RequestInit).body));
    expect(secondBody.messages.some((entry: any) => entry.role === "tool" && entry.tool_call_id === "call_1")).toBe(
      true
    );
  });

  it("runs Gemini native function calls with thought signatures", async () => {
    const appendArgs = {
      key: "tasks",
      heading: "Gemini Runner",
      text: "- [x] Gemini native function calling works.",
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            modelVersion: "models/gemini-test",
            candidates: [
              {
                content: {
                  parts: [
                    {
                      functionCall: {
                        name: "append_agent_doc",
                        args: appendArgs,
                      },
                      thoughtSignature: "sig-a",
                    },
                  ],
                },
                finishReason: "STOP",
              },
            ],
            usageMetadata: {},
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            modelVersion: "models/gemini-test",
            candidates: [
              {
                content: {
                  parts: [{ text: "Gemini 已更新。" }],
                },
                finishReason: "STOP",
              },
            ],
            usageMetadata: {},
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
          name: "Gemini",
          type: "gemini",
          base_url: "https://gemini.example/v1beta",
          api_key: "secret-key",
          enabled: true,
        },
      },
      models: {
        "provider_1:models/gemini-test": {
          id: "provider_1:models/gemini-test",
          provider_id: "provider_1",
          model: "models/gemini-test",
          name: "Gemini Test",
          enabled: true,
        },
      },
    });
    await callApi(store, "/api/agent/config", {
      method: "PUT",
      body: { default_model_id: "provider_1:models/gemini-test" },
    });

    const res = await callApi(store, "/api/agent/chat", {
      method: "POST",
      body: { message: "更新任务" },
    });
    const body = (await res.json()) as any;

    expect(res.status).toBe(200);
    expect(body.message).toBe("Gemini 已更新。");
    expect(body.config.docs.tasks.content_md).toContain("Gemini native function calling works");
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      "https://gemini.example/v1beta/models/gemini-test:generateContent"
    );
    const firstBody = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body));
    expect(firstBody.tools[0].functionDeclarations.some((tool: any) => tool.name === "append_agent_doc")).toBe(true);
    const secondBody = JSON.parse(String((fetchMock.mock.calls[1]?.[1] as RequestInit).body));
    const modelContent = secondBody.contents.find((entry: any) => entry.role === "model");
    expect(modelContent.parts[0].thoughtSignature).toBe("sig-a");
    expect(secondBody.contents.some((entry: any) => entry.parts?.[0]?.functionResponse?.name === "append_agent_doc")).toBe(
      true
    );
  });

  it("blocks real node execution until enabled and then runs node tools", async () => {
    const runNodeArgs = {
      action_id: "json_parse",
      params: { value: "{\"ok\":true}" },
    };
    const toolCall = (id: string) => ({
      model: "gpt-test",
      choices: [
        {
          message: {
            role: "assistant",
            content: null,
            tool_calls: [
              {
                id,
                type: "function",
                function: {
                  name: "run_node",
                  arguments: JSON.stringify(runNodeArgs),
                },
              },
            ],
          },
          finish_reason: "tool_calls",
        },
      ],
      usage: {},
    });
    const finalTurn = {
      model: "gpt-test",
      choices: [{ message: { role: "assistant", content: "节点已执行。" }, finish_reason: "stop" }],
      usage: {},
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(toolCall("call_blocked")), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(finalTurn), { status: 200, headers: { "content-type": "application/json" } })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(toolCall("call_enabled")), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(finalTurn), { status: 200, headers: { "content-type": "application/json" } })
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

    const blockedRes = await callApi(store, "/api/agent/chat", {
      method: "POST",
      body: { message: "执行 json_parse" },
    });
    const blocked = (await blockedRes.json()) as any;
    expect(blockedRes.status).toBe(200);
    expect(blocked.tool_results[0].result.blocked).toBe(true);

    const enableRes = await callApi(store, "/api/agent/config", {
      method: "PUT",
      body: { allow_node_execution: true },
    });
    const enabledConfig = (await enableRes.json()) as any;
    expect(enabledConfig.config.allow_node_execution).toBe(true);
    expect(enabledConfig.config.capabilities.can_execute_node_tools).toBe(true);

    const enabledRes = await callApi(store, "/api/agent/chat", {
      method: "POST",
      body: { message: "执行 json_parse" },
    });
    const enabled = (await enabledRes.json()) as any;
    expect(enabledRes.status).toBe(200);
    expect(enabled.tool_results[0].result.ok).toBe(true);
    expect(enabled.tool_results[0].result.preview).toBe(false);
    expect(enabled.tool_results[0].result.result.data.variables.result).toEqual({ ok: true });
  });

  it("blocks node tools from disabled skills", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            model: "gpt-test",
            choices: [
              {
                message: {
                  role: "assistant",
                  content: null,
                  tool_calls: [
                    {
                      id: "call_disabled_skill",
                      type: "function",
                      function: {
                        name: "run_node",
                        arguments: JSON.stringify({
                          action_id: "json_parse",
                          params: { value: "{\"ok\":true}" },
                        }),
                      },
                    },
                  ],
                },
                finish_reason: "tool_calls",
              },
            ],
            usage: {},
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            model: "gpt-test",
            choices: [{ message: { role: "assistant", content: "已拦截。" }, finish_reason: "stop" }],
            usage: {},
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
      body: {
        default_model_id: "provider_1:gpt-test",
        allow_node_execution: true,
        disabled_skill_keys: ["workflow-nodes"],
      },
    });

    const res = await callApi(store, "/api/agent/chat", {
      method: "POST",
      body: { message: "执行 json_parse" },
    });
    const body = (await res.json()) as any;

    expect(res.status).toBe(200);
    expect(body.tool_results[0].result.blocked).toBe(true);
    expect(body.tool_results[0].result.error).toContain("disabled by skill settings");
  });

  it("routes Telegram /agent messages and injects runtime placeholders into node tools", async () => {
    const llmRequests: any[] = [];
    const telegramMessages: any[] = [];
    const llmResponses = [
      {
        model: "gpt-test",
        choices: [
          {
            message: {
              role: "assistant",
              content: null,
              tool_calls: [
                {
                  id: "call_send",
                  type: "function",
                  function: {
                    name: "run_node",
                    arguments: JSON.stringify({
                      action_id: "send_message",
                      params: {
                        chat_id: "{{ runtime.chat_id }}",
                        text: "节点消息",
                      },
                    }),
                  },
                },
              ],
            },
            finish_reason: "tool_calls",
          },
        ],
        usage: {},
      },
      {
        model: "gpt-test",
        choices: [{ message: { role: "assistant", content: "完成。" }, finish_reason: "stop" }],
        usage: {},
      },
    ];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const body = typeof init?.body === "string" ? JSON.parse(init.body) : {};
      if (url.includes("/chat/completions")) {
        llmRequests.push(body);
        return new Response(JSON.stringify(llmResponses.shift()), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
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
      body: {
        enabled: true,
        default_model_id: "provider_1:gpt-test",
        allow_node_execution: true,
        telegram_command_enabled: true,
      },
    });

    const res = await callApi(store, "/telegram/webhook", {
      method: "POST",
      body: {
        update_id: 9001,
        message: {
          message_id: 77,
          date: 1710000000,
          chat: { id: 12345, type: "private" },
          from: { id: 678, username: "alice", first_name: "Alice" },
          text: "/agent 发一条节点消息",
        },
      },
    });
    await state.drainWaitUntil();

    expect(res.status).toBe(200);
    expect(llmRequests).toHaveLength(2);
    expect(JSON.stringify(llmRequests[0].messages)).toContain("发一条节点消息");
    expect(String(llmRequests[0].messages[0].content)).toContain('"chat_id": "12345"');
    expect(telegramMessages).toHaveLength(2);
    expect(telegramMessages[0]).toMatchObject({ chat_id: "12345", text: "节点消息" });
    expect(telegramMessages[1]).toMatchObject({ chat_id: "12345", text: "完成。" });
  });
});
