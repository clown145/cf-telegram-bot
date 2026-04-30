import { StateStore } from "../../src/state-store";
import { defaultState } from "../../src/utils";
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
    ALLOW_INSECURE_API: "true",
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
    expect(body.context_management_enabled).toBe(true);
    expect(body.context_max_tokens).toBe(24000);
    expect(body.context_compression_target_tokens).toBe(1200);
    expect(body.context_keep_recent_messages).toBe(8);
    expect(body.disabled_skill_keys).toEqual([]);
    expect(body.telegram_command_enabled).toBe(true);
    expect(body.telegram_prefix_trigger).toBe("*");
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
        context_management_enabled: true,
        context_max_tokens: 5000,
        context_compression_target_tokens: 800,
        context_keep_recent_messages: 4,
        disabled_skill_keys: ["workflow-nodes"],
        telegram_command_enabled: false,
        telegram_prefix_trigger: "!",
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
    expect(saved.config.context_management_enabled).toBe(true);
    expect(saved.config.context_max_tokens).toBe(5000);
    expect(saved.config.context_compression_target_tokens).toBe(800);
    expect(saved.config.context_keep_recent_messages).toBe(4);
    expect(saved.config.disabled_skill_keys).toEqual(["workflow-nodes"]);
    expect(saved.config.telegram_command_enabled).toBe(false);
    expect(saved.config.telegram_prefix_trigger).toBe("!");
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
        session_id: "webui:tool-session",
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
    const sessionRes = await callApi(store, "/api/agent/session/webui%3Atool-session");
    const session = (await sessionRes.json()) as any;
    expect(sessionRes.status).toBe(200);
    expect(session.session.recent_history.some((entry: any) => entry.content === "已更新 tasks.md。")).toBe(true);
    expect(session.session.tool_calls[0]).toMatchObject({
      tool: "append_agent_doc",
      tool_call_id: "call_1",
    });
  });

  it("lets the agent read enabled skill files through VFS tools", async () => {
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
                      id: "call_vfs_read",
                      type: "function",
                      function: {
                        name: "vfs_read",
                        arguments: JSON.stringify({ path: "skills://workflow-nodes/ai/SKILL.md" }),
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
            choices: [{ message: { role: "assistant", content: "已读取 AI skill。" }, finish_reason: "stop" }],
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
      body: { default_model_id: "provider_1:gpt-test" },
    });

    const res = await callApi(store, "/api/agent/chat", {
      method: "POST",
      body: { message: "读取 AI 节点 skill" },
    });
    const body = (await res.json()) as any;

    expect(res.status).toBe(200);
    expect(body.message).toBe("已读取 AI skill。");
    expect(body.tool_results[0].tool).toBe("vfs_read");
    expect(body.tool_results[0].result.file.path).toBe("skills://workflow-nodes/ai/SKILL.md");
    expect(body.tool_results[0].result.file.content_md).toContain("# ai");
    const firstBody = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body));
    expect(firstBody.tools.some((tool: any) => tool.function?.name === "vfs_read")).toBe(true);
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
    const skillPackTool = firstBody.tools[0].functionDeclarations.find((tool: any) => tool.name === "upsert_skill_pack");
    expect(skillPackTool.parameters.properties.files.items).toMatchObject({
      type: "object",
      properties: {
        path: { type: "string" },
        content_md: { type: "string" },
      },
    });
    const secondBody = JSON.parse(String((fetchMock.mock.calls[1]?.[1] as RequestInit).body));
    const modelContent = secondBody.contents.find((entry: any) => entry.role === "model");
    expect(modelContent.parts[0].thoughtSignature).toBe("sig-a");
    expect(secondBody.contents.some((entry: any) => entry.parts?.[0]?.functionResponse?.name === "append_agent_doc")).toBe(
      true
    );
  });

  it("lets the agent list and analyze saved workflows through workflow tools", async () => {
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
                      id: "call_list_workflows",
                      type: "function",
                      function: {
                        name: "list_workflows",
                        arguments: JSON.stringify({ query: "hello" }),
                      },
                    },
                    {
                      id: "call_analyze_workflow",
                      type: "function",
                      function: {
                        name: "analyze_workflow",
                        arguments: JSON.stringify({ workflow_id: "wf_hello" }),
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
            choices: [{ message: { role: "assistant", content: "找到了 wf_hello。" }, finish_reason: "stop" }],
            usage: {},
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      );
    vi.stubGlobal("fetch", fetchMock);

    const { state, store } = createStore();
    const model = defaultState("Root");
    model.workflows["wf_hello"] = {
      id: "wf_hello",
      name: "Hello Workflow",
      description: "Send hello text",
      nodes: {
        t1: {
          id: "t1",
          action_id: "trigger_command",
          position: { x: 0, y: 0 },
          data: { command: "hello", enabled: true, priority: 100 },
        },
        n1: {
          id: "n1",
          action_id: "send_message",
          position: { x: 200, y: 0 },
          data: { text: "hello", token: "must-not-leak" },
        },
      },
      edges: [
        {
          id: "e1",
          source_node: "t1",
          source_output: "__control__",
          target_node: "n1",
          target_input: "__control__",
        },
      ],
    };
    await state.storage.put("state", model);
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
      body: { message: "有哪些 hello 工作流？" },
    });
    const body = (await res.json()) as any;

    expect(res.status).toBe(200);
    expect(body.message).toBe("找到了 wf_hello。");
    expect(body.tool_results[0].tool).toBe("list_workflows");
    expect(body.tool_results[0].result.workflows[0].id).toBe("wf_hello");
    expect(body.tool_results[1].tool).toBe("analyze_workflow");
    expect(body.tool_results[1].result.workflow.id).toBe("wf_hello");
    expect(JSON.stringify(body.tool_results)).not.toContain("must-not-leak");
    const firstBody = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body));
    expect(firstBody.tools.some((tool: any) => tool.function?.name === "list_workflows")).toBe(true);
    expect(firstBody.tools.some((tool: any) => tool.function?.name === "analyze_workflow")).toBe(true);
  });

  it("lets the agent edit workflows through versioned workflow editor tools", async () => {
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
                      id: "call_create_workflow",
                      type: "function",
                      function: {
                        name: "create_workflow",
                        arguments: JSON.stringify({
                          workflow_id: "wf_agent_edit",
                          name: "Agent Edited Workflow",
                          reason: "create workflow requested by user",
                        }),
                      },
                    },
                    {
                      id: "call_add_trigger",
                      type: "function",
                      function: {
                        name: "upsert_workflow_node",
                        arguments: JSON.stringify({
                          workflow_id: "wf_agent_edit",
                          node_id: "n1",
                          action_id: "trigger_command",
                          position: { x: 80, y: 100 },
                          data: { command: "agent_edit", enabled: true },
                          reason: "add command trigger",
                        }),
                      },
                    },
                    {
                      id: "call_add_message",
                      type: "function",
                      function: {
                        name: "upsert_workflow_node",
                        arguments: JSON.stringify({
                          workflow_id: "wf_agent_edit",
                          node_id: "n2",
                          action_id: "send_message",
                          position: { x: 360, y: 100 },
                          data: { chat_id: "{{ runtime.chat_id }}", text: "hello" },
                          reason: "add response message",
                        }),
                      },
                    },
                    {
                      id: "call_connect",
                      type: "function",
                      function: {
                        name: "connect_workflow_nodes",
                        arguments: JSON.stringify({
                          workflow_id: "wf_agent_edit",
                          source_node: "n1",
                          target_node: "n2",
                          reason: "connect trigger to message",
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
            choices: [{ message: { role: "assistant", content: "工作流已创建并连接。" }, finish_reason: "stop" }],
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
      body: { default_model_id: "provider_1:gpt-test" },
    });

    const res = await callApi(store, "/api/agent/chat", {
      method: "POST",
      body: { message: "创建一个 /agent_edit 工作流" },
    });
    const body = (await res.json()) as any;

    expect(res.status).toBe(200);
    expect(body.message).toBe("工作流已创建并连接。");
    expect(body.tool_results.map((result: any) => result.tool)).toEqual([
      "create_workflow",
      "upsert_workflow_node",
      "upsert_workflow_node",
      "connect_workflow_nodes",
    ]);
    const model = await state.storage.get<any>("state");
    const workflow = model.workflows.wf_agent_edit;
    expect(workflow.name).toBe("Agent Edited Workflow");
    expect(workflow.nodes.n1.action_id).toBe("trigger_command");
    expect(workflow.nodes.n2.action_id).toBe("send_message");
    expect(workflow.edges[0]).toMatchObject({
      source_node: "n1",
      source_output: "__control__",
      target_node: "n2",
      target_input: "__control__",
    });

    const versionsRes = await callApi(store, "/api/workflows/wf_agent_edit/versions");
    const versions = (await versionsRes.json()) as any;
    expect(versionsRes.status).toBe(200);
    expect(versions.total).toBe(4);
    expect(versions.versions[0].operation).toBe("connect_workflow_nodes");
    const firstBody = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body));
    expect(firstBody.tools.some((tool: any) => tool.function?.name === "upsert_workflow_node")).toBe(true);
    expect(firstBody.tools.some((tool: any) => tool.function?.name === "rollback_workflow")).toBe(true);
  });

  it("lets the agent create and update uploaded skill packs", async () => {
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
                      id: "call_skill_pack",
                      type: "function",
                      function: {
                        name: "upsert_skill_pack",
                        arguments: JSON.stringify({
                          key: "agent_message_skill",
                          label: "Agent Message Skill",
                          category: "message",
                          description: "Created by agent",
                          tool_ids: ["send_message"],
                          files: [
                            {
                              path: "SKILL.md",
                              content_md: [
                                "---",
                                "key: agent_message_skill",
                                "label: Agent Message Skill",
                                "category: message",
                                "tool_ids:",
                                "  - send_message",
                                "---",
                                "",
                                "# Agent Message Skill",
                                "",
                                "Use this when sending Telegram messages.",
                              ].join("\n"),
                            },
                          ],
                          reason: "create requested skill",
                        }),
                      },
                    },
                    {
                      id: "call_skill_file",
                      type: "function",
                      function: {
                        name: "upsert_skill_file",
                        arguments: JSON.stringify({
                          key: "agent_message_skill",
                          path: "references/safety.md",
                          content_md: "# Safety\n\nConfirm chat_id before sending.",
                          reason: "add safety reference",
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
            choices: [{ message: { role: "assistant", content: "Skill 已创建。" }, finish_reason: "stop" }],
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
      body: { default_model_id: "provider_1:gpt-test" },
    });

    const res = await callApi(store, "/api/agent/chat", {
      method: "POST",
      body: { message: "创建消息 skill" },
    });
    const body = (await res.json()) as any;

    expect(res.status).toBe(200);
    expect(body.message).toBe("Skill 已创建。");
    expect(body.tool_results.map((result: any) => result.tool)).toEqual(["upsert_skill_pack", "upsert_skill_file"]);

    const skillsRes = await callApi(store, "/api/actions/skills/available");
    const skills = (await skillsRes.json()) as any;
    const pack = skills.skill_packs.find((item: any) => item.key === "agent_message_skill");
    expect(pack.custom).toBe(true);
    expect(pack.files.some((file: any) => file.path === "custom/agent_message_skill/references/safety.md")).toBe(true);
    const firstBody = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body));
    expect(firstBody.tools.some((tool: any) => tool.function?.name === "upsert_skill_pack")).toBe(true);
  });

  it("feeds thrown tool errors back to the agent so it can recover", async () => {
    const llmRequests: any[] = [];
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = typeof init?.body === "string" ? JSON.parse(init.body) : {};
      llmRequests.push(body);
      if (llmRequests.length === 1) {
        return new Response(
          JSON.stringify({
            model: "gpt-test",
            choices: [
              {
                message: {
                  role: "assistant",
                  content: null,
                  tool_calls: [
                    {
                      id: "call_save_skill",
                      type: "function",
                      function: {
                        name: "upsert_skill_pack",
                        arguments: JSON.stringify({
                          key: "broken_skill",
                          label: "Broken Skill",
                          category: "custom",
                          description: "Trigger a storage failure",
                          content_md: "# Broken Skill",
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
        );
      }
      return new Response(
        JSON.stringify({
          model: "gpt-test",
          choices: [{ message: { role: "assistant", content: "保存失败，我已经看到错误并停止重试。" }, finish_reason: "stop" }],
          usage: {},
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const failingD1 = {
      async exec() {},
      prepare(sql: string) {
        return {
          bind() {
            return this;
          },
          async all() {
            return { results: [] };
          },
          async first() {
            return { count: sql.includes("COUNT") ? 1 : 0 };
          },
          async run() {
            throw new Error("D1 write failed: token=must-not-leak");
          },
        };
      },
    };

    const { state, store } = createStore({ SKILLS_DB: failingD1 });
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
      body: { message: "创建一个会失败的 skill" },
    });
    const body = (await res.json()) as any;

    expect(res.status).toBe(200);
    expect(body.message).toContain("保存失败");
    expect(body.tool_results[0].result).toMatchObject({
      ok: false,
      tool_error: true,
      tool: "upsert_skill_pack",
      retryable: true,
    });
    expect(body.tool_results[0].result.error).toContain("D1 write failed");
    expect(JSON.stringify(body.tool_results)).not.toContain("must-not-leak");
    expect(llmRequests).toHaveLength(2);
    expect(JSON.stringify(llmRequests[1].messages)).toContain("D1 write failed");
    expect(JSON.stringify(llmRequests[1].messages)).not.toContain("must-not-leak");
  });

  it("blocks workflow tools when the workflows skill is disabled", async () => {
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
                      id: "call_list_workflows",
                      type: "function",
                      function: {
                        name: "list_workflows",
                        arguments: "{}",
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
            choices: [{ message: { role: "assistant", content: "工作流 skill 已关闭。" }, finish_reason: "stop" }],
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
        disabled_skill_keys: ["workflows"],
      },
    });

    const res = await callApi(store, "/api/agent/chat", {
      method: "POST",
      body: { message: "列出工作流" },
    });
    const body = (await res.json()) as any;

    expect(res.status).toBe(200);
    expect(body.tool_results[0].result.blocked).toBe(true);
    expect(body.tool_results[0].result.error).toContain("workflow tools are disabled");
    const firstBody = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body));
    expect(firstBody.tools.some((tool: any) => tool.function?.name === "list_workflows")).toBe(false);
  });

  it("compresses long agent history into per-session context", async () => {
    const llmRequests: any[] = [];
    let toolChatCount = 0;
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = typeof init?.body === "string" ? JSON.parse(init.body) : {};
      llmRequests.push(body);
      if (!body.tools) {
        return new Response(
          JSON.stringify({
            model: "gpt-test",
            choices: [{ message: { role: "assistant", content: "Session A compressed summary" }, finish_reason: "stop" }],
            usage: {},
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      toolChatCount += 1;
      return new Response(
        JSON.stringify({
          model: "gpt-test",
          choices: [
            {
              message: { role: "assistant", content: toolChatCount === 1 ? "Session A reply" : "Session B reply" },
              finish_reason: "stop",
            },
          ],
          usage: {},
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
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
        default_model_id: "provider_1:gpt-test",
        context_max_tokens: 24000,
        context_compression_target_tokens: 300,
        context_keep_recent_messages: 2,
      },
    });
    const longText = "历史上下文 ".repeat(500);
    const history = Array.from({ length: 24 }, (_, index) => ({
      role: index % 2 === 0 ? "user" : "assistant",
      content: `${index}: ${longText}`,
    }));

    const res = await callApi(store, "/api/agent/chat", {
      method: "POST",
      body: {
        session_id: "webui:session-a",
        message: "继续 A 会话",
        history,
      },
    });
    const body = (await res.json()) as any;

    expect(res.status).toBe(200);
    expect(body.message).toBe("Session A reply");
    expect(body.context.compressed).toBe(true);
    expect(body.context.session_id).toBe("webui:session-a");
    expect(body.history.length).toBeLessThanOrEqual(4);
    expect(JSON.stringify(llmRequests[0].messages)).toContain("You compress one agent conversation session");
    expect(JSON.stringify(llmRequests[1].messages)).toContain("Session A compressed summary");

    const sessionBRes = await callApi(store, "/api/agent/chat", {
      method: "POST",
      body: {
        session_id: "webui:session-b",
        message: "新的 B 会话",
        history: [],
      },
    });
    const sessionB = (await sessionBRes.json()) as any;

    expect(sessionBRes.status).toBe(200);
    expect(sessionB.message).toBe("Session B reply");
    expect(llmRequests).toHaveLength(3);
    expect(JSON.stringify(llmRequests[2].messages)).not.toContain("Session A compressed summary");

    const sessionsRes = await callApi(store, "/api/agent/sessions");
    const sessions = (await sessionsRes.json()) as any;
    expect(sessionsRes.status).toBe(200);
    expect(sessions.sessions.map((session: any) => session.session_id).sort()).toEqual([
      "webui:session-a",
      "webui:session-b",
    ]);
    const sessionA = sessions.sessions.find((session: any) => session.session_id === "webui:session-a");
    expect(sessionA.summary).toContain("Session A compressed summary");
    expect(sessionA.last_context.compressed).toBe(true);
    const detailRes = await callApi(store, "/api/agent/session/webui%3Asession-a");
    const detail = (await detailRes.json()) as any;
    expect(detailRes.status).toBe(200);
    expect(detail.session.recent_history.some((entry: any) => entry.content === "Session A reply")).toBe(true);

    const promoteRes = await callApi(store, "/api/agent/session/webui%3Asession-a/promote-memory", {
      method: "POST",
      body: { heading: "Important Session A", text: "Remember this from Session A." },
    });
    const promoted = (await promoteRes.json()) as any;
    expect(promoteRes.status).toBe(200);
    expect(promoted.doc.content_md).toContain("Important Session A");
    expect(promoted.doc.content_md).toContain("Remember this from Session A.");

    const deleteRes = await callApi(store, "/api/agent/session/webui%3Asession-a", { method: "DELETE" });
    expect(deleteRes.status).toBe(200);
    const emptySessionsRes = await callApi(store, "/api/agent/sessions");
    const emptySessions = (await emptySessionsRes.json()) as any;
    expect(emptySessions.sessions.map((session: any) => session.session_id)).toEqual(["webui:session-b"]);
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
      if (url.includes("/sendMessage") || url.includes("/sendChatAction")) {
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
    expect(telegramMessages.some((payload) => payload.action === "typing" && payload.chat_id === "12345")).toBe(true);
    const sentTexts = telegramMessages.filter((payload) => payload.text);
    expect(sentTexts).toHaveLength(2);
    expect(sentTexts[0]).toMatchObject({ chat_id: "12345", text: "节点消息" });
    expect(sentTexts[1]).toMatchObject({ chat_id: "12345", text: "完成。" });
  });

  it("routes Telegram prefix messages from groups to the agent", async () => {
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
            choices: [{ message: { role: "assistant", content: "群聊 Agent 回复" }, finish_reason: "stop" }],
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
        telegram_prefix_trigger: "!",
      },
    });

    const res = await callApi(store, "/telegram/webhook", {
      method: "POST",
      body: {
        update_id: 9002,
        message: {
          message_id: 78,
          date: 1710000001,
          chat: { id: -100123, type: "supergroup", title: "Test Group" },
          from: { id: 679, username: "bob", first_name: "Bob" },
          text: "! 群聊问题",
        },
      },
    });
    await state.drainWaitUntil();

    expect(res.status).toBe(200);
    expect(llmRequests).toHaveLength(1);
    expect(JSON.stringify(llmRequests[0].messages)).toContain("群聊问题");
    expect(String(llmRequests[0].messages[0].content)).toContain('"chat_type": "supergroup"');
    expect(telegramMessages).toHaveLength(1);
    expect(telegramMessages[0]).toMatchObject({ chat_id: "-100123", text: "群聊 Agent 回复" });
  });
});
