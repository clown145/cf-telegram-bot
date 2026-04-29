import { jsonResponse, parseJson } from "../utils";
import type { LlmToolDefinition } from "../agents/llmClient";

export interface McpJsonRpcResponse {
  jsonrpc?: string;
  id?: unknown;
  result?: unknown;
  error?: unknown;
}

export interface McpToolConfig {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  enabled: boolean;
  updated_at?: number;
}

export interface McpServerConfig {
  id: string;
  name: string;
  endpoint_url: string;
  headers: Record<string, string>;
  enabled: boolean;
  tools: McpToolConfig[];
  created_at: number;
  updated_at: number;
}

export interface McpConfig {
  servers: Record<string, McpServerConfig>;
}

export interface McpRuntimeTool {
  alias: string;
  server_id: string;
  server_name: string;
  tool_name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

interface D1PreparedStatementLike {
  bind(...values: unknown[]): D1PreparedStatementLike;
  all<T = Record<string, unknown>>(): Promise<{ results?: T[] }>;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run(): Promise<unknown>;
}

export interface DurableObjectStorage {
  get<T>(key: string): Promise<T | undefined>;
  put(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<boolean> | Promise<void>;
}

export class McpService {
  private storage: DurableObjectStorage;

  constructor(storage: DurableObjectStorage) {
    this.storage = storage;
  }

  normalizeMcpServerId(input: unknown): string {
    return String(input || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 64);
  }

  normalizeMcpHeaders(input: unknown, fallback: Record<string, string> = {}): Record<string, string> {
    if (input === undefined) {
      return { ...fallback };
    }
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      return {};
    }
    const headers: Record<string, string> = {};
    for (const [rawKey, rawValue] of Object.entries(input as Record<string, unknown>)) {
      const key = String(rawKey || "").trim();
      const value = String(rawValue || "").trim();
      if (!key || /[\r\n]/.test(key) || /[\r\n]/.test(value)) {
        continue;
      }
      headers[key.slice(0, 120)] = value.slice(0, 4096);
    }
    return headers;
  }

  normalizeMcpTool(input: unknown, fallback?: McpToolConfig): McpToolConfig | null {
    const raw = input && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
    const name = String(raw.name || fallback?.name || "").trim();
    if (!name) {
      return null;
    }
    const inputSchema =
      raw.input_schema && typeof raw.input_schema === "object" && !Array.isArray(raw.input_schema)
        ? (raw.input_schema as Record<string, unknown>)
        : raw.inputSchema && typeof raw.inputSchema === "object" && !Array.isArray(raw.inputSchema)
          ? (raw.inputSchema as Record<string, unknown>)
          : fallback?.input_schema || { type: "object", properties: {} };
    return {
      name: name.slice(0, 160),
      description: String(raw.description || fallback?.description || "").trim().slice(0, 2000),
      input_schema: inputSchema,
      enabled: raw.enabled === undefined ? fallback?.enabled !== false : raw.enabled === true,
      updated_at: Number(raw.updated_at || fallback?.updated_at || Date.now()),
    };
  }

  normalizeMcpServer(input: unknown, existing?: McpServerConfig): { server?: McpServerConfig; error?: string } {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      return { error: "MCP server must be an object" };
    }
    const raw = input as Record<string, unknown>;
    const id = this.normalizeMcpServerId(raw.id || raw.key || raw.name || existing?.id);
    if (!id) {
      return { error: "MCP server id or name is required" };
    }
    const endpointUrl = String(raw.endpoint_url || raw.url || existing?.endpoint_url || "").trim();
    if (!/^https?:\/\//i.test(endpointUrl)) {
      return { error: "MCP endpoint_url must be http(s)" };
    }
    const now = Date.now();
    const fallbackTools = new Map((existing?.tools || []).map((tool) => [tool.name, tool]));
    const rawTools = Array.isArray(raw.tools) ? raw.tools : existing?.tools || [];
    const tools = rawTools
      .map((tool) => {
        const normalizedName =
          tool && typeof tool === "object" && !Array.isArray(tool)
            ? String((tool as Record<string, unknown>).name || "")
            : "";
        return this.normalizeMcpTool(tool, fallbackTools.get(normalizedName));
      })
      .filter((tool): tool is McpToolConfig => Boolean(tool));
    return {
      server: {
        id,
        name: String(raw.name || existing?.name || id).trim().slice(0, 120) || id,
        endpoint_url: endpointUrl,
        headers: this.normalizeMcpHeaders(raw.headers, existing?.headers || {}),
        enabled: raw.enabled === undefined ? existing?.enabled !== false : raw.enabled === true,
        tools,
        created_at: Number(existing?.created_at || now),
        updated_at: now,
      },
    };
  }

  async loadMcpConfig(): Promise<McpConfig> {
    const stored = (await this.storage.get<Partial<McpConfig>>("mcp_config")) || {};
    const servers: Record<string, McpServerConfig> = {};
    const rawServers =
      stored.servers && typeof stored.servers === "object" && !Array.isArray(stored.servers)
        ? stored.servers
        : {};
    for (const [rawId, rawServer] of Object.entries(rawServers)) {
      const rawServerObj = rawServer as unknown as Record<string, unknown>;
      const normalized = this.normalizeMcpServer({
        ...rawServerObj,
        id: rawServerObj?.id || rawId,
      });
      if (normalized.server) {
        servers[normalized.server.id] = normalized.server;
      }
    }
    return { servers };
  }

  async saveMcpConfig(config: McpConfig): Promise<void> {
    await this.storage.put("mcp_config", config);
  }

  publicMcpServer(server: McpServerConfig): Record<string, unknown> {
    return {
      id: server.id,
      name: server.name,
      endpoint_url: server.endpoint_url,
      enabled: server.enabled,
      header_keys: Object.keys(server.headers || {}),
      header_count: Object.keys(server.headers || {}).length,
      tools: (server.tools || []).map((tool) => ({
        name: tool.name,
        description: tool.description,
        input_schema: tool.input_schema,
        enabled: tool.enabled,
        updated_at: tool.updated_at,
      })),
      tool_count: (server.tools || []).length,
      created_at: server.created_at,
      updated_at: server.updated_at,
    };
  }

  publicMcpConfig(config: McpConfig): Record<string, unknown> {
    return {
      servers: Object.values(config.servers || {})
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((server) => this.publicMcpServer(server)),
    };
  }

  async handleMcpConfigGet(): Promise<Response> {
    return jsonResponse(this.publicMcpConfig(await this.loadMcpConfig()));
  }

  async handleMcpServerUpsert(request: Request): Promise<Response> {
    let payload: unknown;
    try {
      payload = await parseJson<unknown>(request);
    } catch (error) {
      return jsonResponse({ error: `invalid body: ${String(error)}` }, 400);
    }
    const config = await this.loadMcpConfig();
    const raw = payload && typeof payload === "object" && !Array.isArray(payload) ? (payload as Record<string, unknown>) : {};
    const rawId = this.normalizeMcpServerId(raw.id || raw.key || raw.name);
    const normalized = this.normalizeMcpServer(raw, rawId ? config.servers[rawId] : undefined);
    if (normalized.error || !normalized.server) {
      return jsonResponse({ error: normalized.error || "invalid MCP server" }, 400);
    }
    config.servers[normalized.server.id] = normalized.server;
    await this.saveMcpConfig(config);
    return jsonResponse({
      status: "ok",
      server: this.publicMcpServer(normalized.server),
      config: this.publicMcpConfig(config),
    });
  }

  async handleMcpServerDelete(serverId: string): Promise<Response> {
    const id = this.normalizeMcpServerId(serverId);
    const config = await this.loadMcpConfig();
    if (id && config.servers[id]) {
      delete config.servers[id];
      await this.saveMcpConfig(config);
    }
    return jsonResponse({ status: "ok", deleted_id: id, config: this.publicMcpConfig(config) });
  }

  buildMcpRequestHeaders(server: McpServerConfig, sessionId = ""): Record<string, string> {
    return {
      accept: "application/json, text/event-stream",
      "content-type": "application/json",
      ...(server.headers || {}),
      ...(sessionId ? { "mcp-session-id": sessionId } : {}),
    };
  }

  async parseMcpResponse(response: Response, expectedId: number): Promise<McpJsonRpcResponse> {
    const sessionContentType = response.headers.get("content-type") || "";
    const text = await response.text();
    let payload: unknown = null;
    if (sessionContentType.includes("text/event-stream")) {
      for (const rawLine of text.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line.startsWith("data:")) {
          continue;
        }
        const data = line.slice("data:".length).trim();
        if (!data || data === "[DONE]") {
          continue;
        }
        try {
          const parsed = JSON.parse(data);
          if (parsed && typeof parsed === "object" && (!("id" in parsed) || Number((parsed as any).id) === expectedId)) {
            payload = parsed;
            break;
          }
        } catch {
          continue;
        }
      }
    } else if (text.trim()) {
      payload = JSON.parse(text);
    }
    const candidates = Array.isArray(payload) ? payload : [payload];
    const matched = candidates.find(
      (entry) => entry && typeof entry === "object" && Number((entry as Record<string, unknown>).id) === expectedId
    ) || candidates.find((entry) => entry && typeof entry === "object");
    if (!matched || typeof matched !== "object") {
      throw new Error(`MCP response is empty or invalid (${response.status})`);
    }
    const result = matched as McpJsonRpcResponse;
    if (!response.ok) {
      throw new Error(`MCP HTTP request failed (${response.status}): ${text.slice(0, 500)}`);
    }
    if (result.error) {
      const detail =
        result.error && typeof result.error === "object"
          ? JSON.stringify(result.error)
          : String(result.error || "");
      throw new Error(`MCP JSON-RPC error: ${detail}`);
    }
    return result;
  }

  async postMcpJsonRpc(
    server: McpServerConfig,
    method: string,
    params: Record<string, unknown> = {},
    sessionId = ""
  ): Promise<{ result: unknown; session_id: string }> {
    const id = Math.floor(Math.random() * 1_000_000_000);
    const signal =
      typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function"
        ? AbortSignal.timeout(15_000)
        : undefined;
    const response = await fetch(server.endpoint_url, {
      method: "POST",
      headers: this.buildMcpRequestHeaders(server, sessionId),
      body: JSON.stringify({
        jsonrpc: "2.0",
        id,
        method,
        params,
      }),
      signal,
    });
    const payload = await this.parseMcpResponse(response, id);
    return {
      result: payload.result,
      session_id: response.headers.get("mcp-session-id") || sessionId,
    };
  }

  async initializeMcpSession(server: McpServerConfig): Promise<string> {
    const response = await this.postMcpJsonRpc(server, "initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: {
        name: "cf-telegram-bot-agent",
        version: "1.0.0",
      },
    });
    return response.session_id;
  }

  async fetchMcpServerTools(server: McpServerConfig): Promise<McpToolConfig[]> {
    const sessionId = await this.initializeMcpSession(server);
    const listResponse = await this.postMcpJsonRpc(server, "tools/list", {}, sessionId);
    const result = listResponse.result && typeof listResponse.result === "object" ? (listResponse.result as Record<string, unknown>) : {};
    const rawTools = Array.isArray(result.tools) ? result.tools : [];
    const previous = new Map((server.tools || []).map((tool) => [tool.name, tool]));
    return rawTools
      .map((tool) => {
        const name =
          tool && typeof tool === "object" && !Array.isArray(tool)
            ? String((tool as Record<string, unknown>).name || "")
            : "";
        return this.normalizeMcpTool(tool, previous.get(name));
      })
      .filter((tool): tool is McpToolConfig => Boolean(tool));
  }

  async handleMcpServerFetchTools(serverId: string): Promise<Response> {
    const id = this.normalizeMcpServerId(serverId);
    const config = await this.loadMcpConfig();
    const server = config.servers[id];
    if (!server) {
      return jsonResponse({ error: `MCP server not found: ${id}` }, 404);
    }
    try {
      const tools = await this.fetchMcpServerTools(server);
      const nextServer: McpServerConfig = {
        ...server,
        tools,
        updated_at: Date.now(),
      };
      config.servers[id] = nextServer;
      await this.saveMcpConfig(config);
      return jsonResponse({
        status: "ok",
        server: this.publicMcpServer(nextServer),
        config: this.publicMcpConfig(config),
      });
    } catch (error) {
      return jsonResponse({ error: `fetch MCP tools failed: ${String(error)}` }, 502);
    }
  }

  normalizeMcpToolAliasPart(input: unknown, limit: number): string {
    return String(input || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, limit) || "tool";
  }

  buildMcpRuntimeTools(config: McpConfig): { definitions: LlmToolDefinition[]; tools: Map<string, McpRuntimeTool> } {
    const definitions: LlmToolDefinition[] = [];
    const tools = new Map<string, McpRuntimeTool>();
    for (const server of Object.values(config.servers || {}).filter((item) => item.enabled)) {
      const serverPart = this.normalizeMcpToolAliasPart(server.id, 20);
      for (const tool of server.tools || []) {
        if (tool.enabled === false) {
          continue;
        }
        const toolPart = this.normalizeMcpToolAliasPart(tool.name, 34);
        let alias = `mcp__${serverPart}__${toolPart}`.slice(0, 64);
        let suffix = 2;
        while (tools.has(alias)) {
          const tail = `_${suffix}`;
          alias = `mcp__${serverPart}__${toolPart}`.slice(0, 64 - tail.length) + tail;
          suffix += 1;
        }
        const runtimeTool: McpRuntimeTool = {
          alias,
          server_id: server.id,
          server_name: server.name,
          tool_name: tool.name,
          description: tool.description,
          input_schema: tool.input_schema || { type: "object", properties: {} },
        };
        tools.set(alias, runtimeTool);
        definitions.push({
          name: alias,
          description: `MCP tool from ${server.name}: ${tool.name}. ${tool.description || ""}`.trim().slice(0, 2000),
          parameters: runtimeTool.input_schema,
        });
      }
    }
    return { definitions, tools };
  }

  async callMcpRuntimeTool(
    runtimeTool: McpRuntimeTool,
    args: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const config = await this.loadMcpConfig();
    const server = config.servers[runtimeTool.server_id];
    if (!server || server.enabled === false) {
      return { ok: false, error: `MCP server is disabled or missing: ${runtimeTool.server_id}` };
    }
    const tool = (server.tools || []).find((entry) => entry.name === runtimeTool.tool_name);
    if (!tool || tool.enabled === false) {
      return { ok: false, error: `MCP tool is disabled or missing: ${runtimeTool.tool_name}` };
    }
    try {
      const sessionId = await this.initializeMcpSession(server);
      const response = await this.postMcpJsonRpc(
        server,
        "tools/call",
        {
          name: runtimeTool.tool_name,
          arguments: args || {},
        },
        sessionId
      );
      return {
        ok: true,
        server_id: server.id,
        server_name: server.name,
        tool_name: runtimeTool.tool_name,
        result: response.result,
      };
    } catch (error) {
      return {
        ok: false,
        server_id: server.id,
        tool_name: runtimeTool.tool_name,
        error: String(error),
      };
    }
  }

  buildMcpToolsSkillPack() {
    const rootContent = [
      "---",
      "name: mcp-tools",
      "description: Dynamic MCP tool access. Enable this skill to let the agent use configured HTTP MCP servers.",
      "---",
      "",
      "# MCP Tools",
      "",
      "This skill exposes tools discovered from configured MCP servers. MCP servers are configured in the MCP tab.",
      "",
      "## Rules",
      "",
      "- Only HTTP or Streamable HTTP MCP servers are supported in this Worker runtime.",
      "- Stdio MCP servers must be bridged through an external HTTP gateway before they can be used here.",
      "- The WebUI never receives stored MCP header values; it only sees header names.",
      "- Use the smallest MCP tool needed for the user request and explain side effects when the server/tool is not read-only.",
      "",
      "## Discovery",
      "",
      "1. Configure an MCP server endpoint and headers.",
      "2. Fetch tools from the MCP tab.",
      "3. Enable this skill and the desired MCP server.",
      "4. The agent will receive the discovered MCP tools as native model tool definitions.",
    ].join("\n");
    return {
      key: "mcp-tools",
      label: "MCP Tools",
      category: "integration",
      description: "Dynamic skill for using configured HTTP MCP server tools.",
      tool_count: 0,
      tools: [],
      tool_ids: [],
      files: [
        {
          path: "mcp-tools/SKILL.md",
          kind: "root",
          title: "MCP Tools",
          content_md: rootContent,
          source: "generated",
        },
      ],
      content_md: rootContent,
      format: "markdown",
      source: "generated",
    };
  }
}
