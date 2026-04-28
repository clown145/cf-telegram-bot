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

describe("mcp api", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("stores MCP server secrets privately, fetches tools, and lets agent call MCP tools", async () => {
    let llmCalls = 0;
    const mcpRequests: any[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const body = typeof init?.body === "string" ? JSON.parse(init.body) : {};
      if (url === "https://mcp.example/rpc") {
        mcpRequests.push({ body, headers: init?.headers });
        if (body.method === "initialize") {
          return new Response(JSON.stringify({ jsonrpc: "2.0", id: body.id, result: { serverInfo: { name: "demo" } } }), {
            status: 200,
            headers: { "content-type": "application/json", "mcp-session-id": "session-1" },
          });
        }
        if (body.method === "tools/list") {
          return new Response(
            JSON.stringify({
              jsonrpc: "2.0",
              id: body.id,
              result: {
                tools: [
                  {
                    name: "echo",
                    description: "Echo text.",
                    inputSchema: {
                      type: "object",
                      properties: { text: { type: "string" } },
                      required: ["text"],
                    },
                  },
                ],
              },
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        }
        if (body.method === "tools/call") {
          return new Response(
            JSON.stringify({
              jsonrpc: "2.0",
              id: body.id,
              result: { content: [{ type: "text", text: `echo:${body.params.arguments.text}` }] },
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        }
      }
      if (url.includes("/chat/completions")) {
        llmCalls += 1;
        if (llmCalls === 1) {
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
                        id: "call_mcp_echo",
                        type: "function",
                        function: {
                          name: "mcp__demo_mcp__echo",
                          arguments: JSON.stringify({ text: "hi" }),
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
            choices: [{ message: { role: "assistant", content: "MCP 返回 echo:hi" }, finish_reason: "stop" }],
            usage: {},
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } });
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
      body: { default_model_id: "provider_1:gpt-test" },
    });

    const saveRes = await callApi(store, "/api/mcp/servers", {
      method: "POST",
      body: {
        id: "demo_mcp",
        name: "Demo MCP",
        endpoint_url: "https://mcp.example/rpc",
        enabled: true,
        headers: { Authorization: "Bearer mcp-secret" },
      },
    });
    const saved = (await saveRes.json()) as any;
    expect(saveRes.status).toBe(200);
    expect(saved.server.header_keys).toEqual(["Authorization"]);
    expect(JSON.stringify(saved)).not.toContain("mcp-secret");

    const fetchToolsRes = await callApi(store, "/api/mcp/servers/demo_mcp/fetch-tools", { method: "POST" });
    const fetched = (await fetchToolsRes.json()) as any;
    expect(fetchToolsRes.status).toBe(200);
    expect(fetched.server.tools[0].name).toBe("echo");
    expect(JSON.stringify(fetched)).not.toContain("mcp-secret");

    const chatRes = await callApi(store, "/api/agent/chat", {
      method: "POST",
      body: { message: "调用 MCP echo" },
    });
    const chat = (await chatRes.json()) as any;
    expect(chatRes.status).toBe(200);
    expect(chat.message).toBe("MCP 返回 echo:hi");
    expect(chat.tool_results[0].tool).toBe("mcp__demo_mcp__echo");
    expect(chat.tool_results[0].result.result.content[0].text).toBe("echo:hi");
    expect(mcpRequests.some((entry) => entry.body.method === "tools/call")).toBe(true);
    const firstLlmBody = JSON.parse(String((fetchMock.mock.calls.find((call) => String(call[0]).includes("/chat/completions"))?.[1] as RequestInit).body));
    expect(firstLlmBody.tools.some((tool: any) => tool.function?.name === "mcp__demo_mcp__echo")).toBe(true);
  });
});
