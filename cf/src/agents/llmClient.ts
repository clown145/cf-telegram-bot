export const LLM_CONFIG_ENV_KEY = "__LLM_CONFIG__";

export const LLM_PROVIDER_TYPES = ["openai", "gemini"] as const;
export type LlmProviderType = (typeof LLM_PROVIDER_TYPES)[number];

export interface LlmProviderConfig {
  id: string;
  name: string;
  type: LlmProviderType;
  base_url: string;
  api_key: string;
  enabled: boolean;
  created_at?: number;
  updated_at?: number;
}

export interface LlmModelConfig {
  id: string;
  provider_id: string;
  model: string;
  name: string;
  enabled: boolean;
  created_at?: number;
  updated_at?: number;
}

export interface LlmRuntimeConfig {
  providers: Record<string, LlmProviderConfig>;
  models: Record<string, LlmModelConfig>;
}

export interface RemoteLlmModel {
  model: string;
  name: string;
}

export interface LlmChatRequest {
  systemPrompt?: string;
  userPrompt: string;
  modelId?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  responseMode?: "text" | "json";
  jsonSchema?: string;
}

export interface LlmToolDefinition {
  name: string;
  description: string;
  parameters?: Record<string, unknown>;
}

export interface LlmNativeToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  thought_signature?: string;
}

export interface LlmNativeChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content?: string;
  tool_calls?: LlmNativeToolCall[];
  tool_call_id?: string;
  name?: string;
}

export interface LlmToolChatRequest {
  systemPrompt?: string;
  messages: LlmNativeChatMessage[];
  tools: LlmToolDefinition[];
  modelId?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface LlmChatResult {
  text: string;
  raw: Record<string, unknown>;
  model: string;
  usage: Record<string, unknown>;
  finish_reason: string;
  provider_id?: string;
  provider_type?: LlmProviderType;
}

export interface LlmToolChatResult extends LlmChatResult {
  tool_calls: LlmNativeToolCall[];
  assistant_message: LlmNativeChatMessage;
}

export type OpenAICompatibleChatRequest = LlmChatRequest;
export type OpenAICompatibleChatResult = LlmChatResult;

function readEnv(env: Record<string, unknown>, name: string): string {
  const value = env[name];
  return typeof value === "string" ? value.trim() : "";
}

export function defaultBaseUrlForProvider(type: LlmProviderType): string {
  return type === "gemini"
    ? "https://generativelanguage.googleapis.com/v1beta"
    : "https://api.openai.com/v1";
}

function normalizeBaseUrl(baseUrl: string, fallback: string): string {
  return (baseUrl || fallback).trim().replace(/\/+$/, "") || fallback;
}

function normalizeOpenAIChatUrl(baseUrl: string): string {
  const base = normalizeBaseUrl(baseUrl, defaultBaseUrlForProvider("openai"));
  if (/\/chat\/completions$/i.test(base)) {
    return base;
  }
  if (/\/models$/i.test(base)) {
    return base.replace(/\/models$/i, "/chat/completions");
  }
  return `${base}/chat/completions`;
}

function normalizeOpenAIModelsUrl(baseUrl: string): string {
  const base = normalizeBaseUrl(baseUrl, defaultBaseUrlForProvider("openai"));
  if (/\/models$/i.test(base)) {
    return base;
  }
  if (/\/chat\/completions$/i.test(base)) {
    return base.replace(/\/chat\/completions$/i, "/models");
  }
  return `${base}/models`;
}

function normalizeGeminiModelsUrl(baseUrl: string): string {
  const base = normalizeBaseUrl(baseUrl, defaultBaseUrlForProvider("gemini"));
  if (/\/models$/i.test(base)) {
    return base;
  }
  return `${base}/models`;
}

function normalizeGeminiGenerateUrl(baseUrl: string, model: string): string {
  const base = normalizeBaseUrl(baseUrl, defaultBaseUrlForProvider("gemini"));
  const cleanedModel = String(model || "").trim().replace(/^\/+/, "");
  const modelPath = cleanedModel.startsWith("models/") ? cleanedModel : `models/${cleanedModel}`;
  return `${base}/${modelPath}:generateContent`;
}

function withGeminiApiKey(url: string, apiKey: string): string {
  const parsed = new URL(url);
  parsed.searchParams.set("key", apiKey);
  return parsed.toString();
}

function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, parsed));
}

function parseJsonSchema(raw: string): Record<string, unknown> {
  const trimmed = String(raw || "").trim();
  if (!trimmed) {
    return {};
  }
  const parsed = JSON.parse(trimmed);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("json_schema must be a JSON object");
  }
  return parsed as Record<string, unknown>;
}

function buildOpenAIResponseFormat(mode: "text" | "json", jsonSchema: string): Record<string, unknown> | undefined {
  if (mode !== "json") {
    return undefined;
  }
  const schema = parseJsonSchema(jsonSchema);
  if (Object.keys(schema).length) {
    return {
      type: "json_schema",
      json_schema: {
        name: "llm_generate_response",
        schema,
        strict: false,
      },
    };
  }
  return { type: "json_object" };
}

function extractErrorMessage(data: unknown, fallback: string): string {
  if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    const error = obj.error;
    if (error && typeof error === "object") {
      const message = (error as Record<string, unknown>).message;
      if (message) {
        return String(message);
      }
    }
    if (typeof error === "string") {
      return error;
    }
    if (typeof obj.message === "string") {
      return obj.message;
    }
  }
  return fallback || "unknown LLM error";
}

async function parseJsonResponse(response: Response): Promise<unknown> {
  const bodyText = await response.text();
  if (!bodyText) {
    return {};
  }
  try {
    return JSON.parse(bodyText);
  } catch {
    return { message: bodyText };
  }
}

function readRuntimeConfig(env: Record<string, unknown>): LlmRuntimeConfig | null {
  const raw = env[LLM_CONFIG_ENV_KEY];
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const config = raw as Partial<LlmRuntimeConfig>;
  return {
    providers:
      config.providers && typeof config.providers === "object" && !Array.isArray(config.providers)
        ? (config.providers as Record<string, LlmProviderConfig>)
        : {},
    models:
      config.models && typeof config.models === "object" && !Array.isArray(config.models)
        ? (config.models as Record<string, LlmModelConfig>)
        : {},
  };
}

function ensureProviderHasKey(provider: LlmProviderConfig): void {
  if (!String(provider.api_key || "").trim()) {
    throw new Error(`LLM provider API key is not configured: ${provider.name || provider.id}`);
  }
}

function ensureProviderReady(provider: LlmProviderConfig): void {
  if (!provider.enabled) {
    throw new Error(`LLM provider is disabled: ${provider.name || provider.id}`);
  }
  ensureProviderHasKey(provider);
}

function ensureUserPrompt(userPrompt: string): void {
  if (!String(userPrompt || "").trim()) {
    throw new Error("user_prompt is required");
  }
}

function extractOpenAIContent(content: unknown): string {
  if (content === undefined || content === null) {
    return "";
  }
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (part && typeof part === "object" && typeof (part as Record<string, unknown>).text === "string") {
          return String((part as Record<string, unknown>).text);
        }
        return "";
      })
      .join("");
  }
  return String(content);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function normalizeToolParameters(parameters?: Record<string, unknown>): Record<string, unknown> {
  if (parameters && typeof parameters === "object" && !Array.isArray(parameters) && Object.keys(parameters).length) {
    return parameters;
  }
  return {
    type: "object",
    properties: {},
  };
}

function parseToolArguments(raw: unknown): Record<string, unknown> {
  if (isPlainRecord(raw)) {
    return raw;
  }
  if (typeof raw !== "string") {
    return {};
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    return {};
  }
  try {
    const parsed = JSON.parse(trimmed);
    return isPlainRecord(parsed) ? parsed : { value: parsed };
  } catch {
    return { raw: trimmed };
  }
}

function stringifyToolResult(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }
  if (content === undefined || content === null) {
    return "";
  }
  try {
    return JSON.stringify(content);
  } catch {
    return String(content);
  }
}

function toOpenAIChatMessage(message: LlmNativeChatMessage, index: number): Record<string, unknown> {
  if (message.role === "tool") {
    return {
      role: "tool",
      tool_call_id: message.tool_call_id || `tool_call_${index}`,
      content: stringifyToolResult(message.content || ""),
    };
  }
  if (message.role === "assistant") {
    const toolCalls = (message.tool_calls || [])
      .filter((call) => String(call.name || "").trim())
      .map((call, callIndex) => ({
        id: call.id || `call_${index}_${callIndex}`,
        type: "function",
        ...(call.thought_signature
          ? {
              extra_content: {
                google: {
                  thought_signature: call.thought_signature,
                },
              },
            }
          : {}),
        function: {
          name: call.name,
          arguments: JSON.stringify(call.arguments || {}),
        },
      }));
    return {
      role: "assistant",
      content: message.content || (toolCalls.length ? null : ""),
      ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
    };
  }
  return {
    role: message.role,
    content: message.content || "",
  };
}

function buildOpenAIToolDefinitions(tools: LlmToolDefinition[]): Array<Record<string, unknown>> {
  return tools
    .filter((tool) => String(tool.name || "").trim())
    .map((tool) => ({
      type: "function",
      function: {
        name: tool.name,
        description: tool.description || tool.name,
        parameters: normalizeToolParameters(tool.parameters),
      },
    }));
}

async function callOpenAIProviderChat(
  provider: Pick<LlmProviderConfig, "base_url" | "api_key">,
  model: string,
  request: LlmChatRequest
): Promise<LlmChatResult> {
  const userPrompt = String(request.userPrompt || "");
  ensureUserPrompt(userPrompt);

  const mode = request.responseMode === "json" ? "json" : "text";
  const payload: Record<string, unknown> = {
    model,
    messages: [
      ...(request.systemPrompt ? [{ role: "system", content: String(request.systemPrompt) }] : []),
      { role: "user", content: userPrompt },
    ],
    temperature: clampNumber(request.temperature, 0.2, 0, 2),
  };

  const maxTokens = Math.trunc(clampNumber(request.maxTokens, 512, 1, 128000));
  if (maxTokens > 0) {
    payload.max_tokens = maxTokens;
  }

  const responseFormat = buildOpenAIResponseFormat(mode, request.jsonSchema || "");
  if (responseFormat) {
    payload.response_format = responseFormat;
  }

  const response = await fetch(normalizeOpenAIChatUrl(provider.base_url), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${provider.api_key}`,
    },
    body: JSON.stringify(payload),
  });

  const data = await parseJsonResponse(response);
  if (!response.ok) {
    throw new Error(`LLM request failed (${response.status}): ${extractErrorMessage(data, "")}`);
  }

  const raw = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  const choices = Array.isArray(raw.choices) ? raw.choices : [];
  const firstChoice = (choices[0] || {}) as Record<string, unknown>;
  const message = (firstChoice.message || {}) as Record<string, unknown>;
  const content = extractOpenAIContent(message.content);

  return {
    text: content,
    raw,
    model: String(raw.model || model),
    usage:
      raw.usage && typeof raw.usage === "object" && !Array.isArray(raw.usage)
        ? (raw.usage as Record<string, unknown>)
        : {},
    finish_reason: String(firstChoice.finish_reason || ""),
  };
}

async function callOpenAIProviderToolChat(
  provider: Pick<LlmProviderConfig, "base_url" | "api_key">,
  model: string,
  request: LlmToolChatRequest
): Promise<LlmToolChatResult> {
  const messages = [
    ...(request.systemPrompt ? [{ role: "system" as const, content: String(request.systemPrompt) }] : []),
    ...request.messages,
  ].map((message, index) => toOpenAIChatMessage(message, index));

  const payload: Record<string, unknown> = {
    model,
    messages,
    temperature: clampNumber(request.temperature, 0.2, 0, 2),
    tools: buildOpenAIToolDefinitions(request.tools || []),
    tool_choice: "auto",
  };

  const maxTokens = Math.trunc(clampNumber(request.maxTokens, 1600, 1, 128000));
  if (maxTokens > 0) {
    payload.max_tokens = maxTokens;
  }

  const response = await fetch(normalizeOpenAIChatUrl(provider.base_url), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${provider.api_key}`,
    },
    body: JSON.stringify(payload),
  });

  const data = await parseJsonResponse(response);
  if (!response.ok) {
    throw new Error(`LLM request failed (${response.status}): ${extractErrorMessage(data, "")}`);
  }

  const raw = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  const choices = Array.isArray(raw.choices) ? raw.choices : [];
  const firstChoice = (choices[0] || {}) as Record<string, unknown>;
  const message = (firstChoice.message || {}) as Record<string, unknown>;
  const content = extractOpenAIContent(message.content);
  const toolCalls = (Array.isArray(message.tool_calls) ? message.tool_calls : [])
    .map((entry, index) => {
      const item = entry && typeof entry === "object" ? (entry as Record<string, unknown>) : {};
      const fn = item.function && typeof item.function === "object" ? (item.function as Record<string, unknown>) : {};
      const name = String(fn.name || item.name || "").trim();
      if (!name) {
        return null;
      }
      const extraContent =
        item.extra_content && typeof item.extra_content === "object"
          ? (item.extra_content as Record<string, unknown>)
          : {};
      const googleExtra =
        extraContent.google && typeof extraContent.google === "object"
          ? (extraContent.google as Record<string, unknown>)
          : {};
      return {
        id: String(item.id || `call_${index}`),
        name,
        arguments: parseToolArguments(fn.arguments ?? item.arguments),
        thought_signature:
          typeof googleExtra.thought_signature === "string" ? String(googleExtra.thought_signature) : undefined,
      };
    })
    .filter((call): call is LlmNativeToolCall => Boolean(call));
  const assistantMessage: LlmNativeChatMessage = {
    role: "assistant",
    content,
    tool_calls: toolCalls,
  };

  return {
    text: content,
    raw,
    model: String(raw.model || model),
    usage:
      raw.usage && typeof raw.usage === "object" && !Array.isArray(raw.usage)
        ? (raw.usage as Record<string, unknown>)
        : {},
    finish_reason: String(firstChoice.finish_reason || ""),
    tool_calls: toolCalls,
    assistant_message: assistantMessage,
  };
}

function buildGeminiGenerationConfig(request: LlmChatRequest): Record<string, unknown> {
  const mode = request.responseMode === "json" ? "json" : "text";
  const generationConfig: Record<string, unknown> = {
    temperature: clampNumber(request.temperature, 0.2, 0, 2),
    maxOutputTokens: Math.trunc(clampNumber(request.maxTokens, 512, 1, 128000)),
  };
  if (mode === "json") {
    generationConfig.responseMimeType = "application/json";
    const schema = parseJsonSchema(request.jsonSchema || "");
    if (Object.keys(schema).length) {
      generationConfig.responseSchema = schema;
    }
  }
  return generationConfig;
}

function buildGeminiToolGenerationConfig(request: LlmToolChatRequest): Record<string, unknown> {
  return {
    temperature: clampNumber(request.temperature, 0.2, 0, 2),
    maxOutputTokens: Math.trunc(clampNumber(request.maxTokens, 1600, 1, 128000)),
  };
}

function parseMaybeJsonRecord(text: string): Record<string, unknown> {
  const trimmed = String(text || "").trim();
  if (!trimmed) {
    return {};
  }
  try {
    const parsed = JSON.parse(trimmed);
    return isPlainRecord(parsed) ? parsed : { result: parsed };
  } catch {
    return { result: trimmed };
  }
}

function toGeminiContent(message: LlmNativeChatMessage, index: number): Record<string, unknown> | null {
  if (message.role === "system") {
    return null;
  }
  if (message.role === "tool") {
    return {
      role: "user",
      parts: [
        {
          functionResponse: {
            name: message.name || message.tool_call_id || `tool_result_${index}`,
            response: parseMaybeJsonRecord(message.content || ""),
          },
        },
      ],
    };
  }
  if (message.role === "assistant") {
    const parts: Array<Record<string, unknown>> = [];
    if (message.content) {
      parts.push({ text: message.content });
    }
    for (const call of message.tool_calls || []) {
      if (!String(call.name || "").trim()) {
        continue;
      }
      const part: Record<string, unknown> = {
        functionCall: {
          name: call.name,
          args: call.arguments || {},
        },
      };
      if (call.thought_signature) {
        part.thoughtSignature = call.thought_signature;
      }
      parts.push(part);
    }
    return {
      role: "model",
      parts: parts.length ? parts : [{ text: "" }],
    };
  }
  return {
    role: "user",
    parts: [{ text: message.content || "" }],
  };
}

function buildGeminiFunctionDeclarations(tools: LlmToolDefinition[]): Array<Record<string, unknown>> {
  return tools
    .filter((tool) => String(tool.name || "").trim())
    .map((tool) => ({
      name: tool.name,
      description: tool.description || tool.name,
      parameters: normalizeToolParameters(tool.parameters),
    }));
}

async function callGeminiChat(
  provider: Pick<LlmProviderConfig, "base_url" | "api_key">,
  model: string,
  request: LlmChatRequest
): Promise<LlmChatResult> {
  const userPrompt = String(request.userPrompt || "");
  ensureUserPrompt(userPrompt);

  const payload: Record<string, unknown> = {
    contents: [
      {
        role: "user",
        parts: [{ text: userPrompt }],
      },
    ],
    generationConfig: buildGeminiGenerationConfig(request),
  };
  if (request.systemPrompt) {
    payload.systemInstruction = {
      parts: [{ text: String(request.systemPrompt) }],
    };
  }

  const response = await fetch(withGeminiApiKey(normalizeGeminiGenerateUrl(provider.base_url, model), provider.api_key), {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await parseJsonResponse(response);
  if (!response.ok) {
    throw new Error(`LLM request failed (${response.status}): ${extractErrorMessage(data, "")}`);
  }

  const raw = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  const candidates = Array.isArray(raw.candidates) ? raw.candidates : [];
  const firstCandidate = (candidates[0] || {}) as Record<string, unknown>;
  const content = (firstCandidate.content || {}) as Record<string, unknown>;
  const parts = Array.isArray(content.parts) ? content.parts : [];
  const text = parts
    .map((part) => {
      if (part && typeof part === "object" && typeof (part as Record<string, unknown>).text === "string") {
        return String((part as Record<string, unknown>).text);
      }
      return "";
    })
    .join("");

  return {
    text,
    raw,
    model: String(raw.modelVersion || model),
    usage:
      raw.usageMetadata && typeof raw.usageMetadata === "object" && !Array.isArray(raw.usageMetadata)
        ? (raw.usageMetadata as Record<string, unknown>)
        : {},
    finish_reason: String(firstCandidate.finishReason || ""),
  };
}

async function callGeminiToolChat(
  provider: Pick<LlmProviderConfig, "base_url" | "api_key">,
  model: string,
  request: LlmToolChatRequest
): Promise<LlmToolChatResult> {
  const systemMessages = request.messages
    .filter((message) => message.role === "system" && message.content)
    .map((message) => message.content)
    .filter(Boolean)
    .join("\n\n");
  const contents = request.messages
    .map((message, index) => toGeminiContent(message, index))
    .filter((content): content is Record<string, unknown> => Boolean(content));
  if (contents.length === 0) {
    contents.push({ role: "user", parts: [{ text: "" }] });
  }

  const systemText = [request.systemPrompt, systemMessages].filter(Boolean).join("\n\n");
  const payload: Record<string, unknown> = {
    contents,
    generationConfig: buildGeminiToolGenerationConfig(request),
    tools: [
      {
        functionDeclarations: buildGeminiFunctionDeclarations(request.tools || []),
      },
    ],
    toolConfig: {
      functionCallingConfig: {
        mode: "AUTO",
      },
    },
  };
  if (systemText) {
    payload.systemInstruction = {
      parts: [{ text: systemText }],
    };
  }

  const response = await fetch(withGeminiApiKey(normalizeGeminiGenerateUrl(provider.base_url, model), provider.api_key), {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await parseJsonResponse(response);
  if (!response.ok) {
    throw new Error(`LLM request failed (${response.status}): ${extractErrorMessage(data, "")}`);
  }

  const raw = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  const candidates = Array.isArray(raw.candidates) ? raw.candidates : [];
  const firstCandidate = (candidates[0] || {}) as Record<string, unknown>;
  const content = (firstCandidate.content || {}) as Record<string, unknown>;
  const parts = Array.isArray(content.parts) ? content.parts : [];
  const text = parts
    .map((part) => {
      if (part && typeof part === "object" && typeof (part as Record<string, unknown>).text === "string") {
        return String((part as Record<string, unknown>).text);
      }
      return "";
    })
    .join("");
  const toolCalls = parts
    .map((part, index) => {
      const obj = part && typeof part === "object" ? (part as Record<string, unknown>) : {};
      const rawCall =
        obj.functionCall && typeof obj.functionCall === "object"
          ? (obj.functionCall as Record<string, unknown>)
          : null;
      const name = String(rawCall?.name || "").trim();
      if (!rawCall || !name) {
        return null;
      }
      return {
        id: `gemini_call_${index}`,
        name,
        arguments: parseToolArguments(rawCall.args),
        thought_signature:
          typeof obj.thoughtSignature === "string"
            ? String(obj.thoughtSignature)
            : typeof obj.thought_signature === "string"
              ? String(obj.thought_signature)
              : undefined,
      };
    })
    .filter((call): call is LlmNativeToolCall => Boolean(call));
  const assistantMessage: LlmNativeChatMessage = {
    role: "assistant",
    content: text,
    tool_calls: toolCalls,
  };

  return {
    text,
    raw,
    model: String(raw.modelVersion || model),
    usage:
      raw.usageMetadata && typeof raw.usageMetadata === "object" && !Array.isArray(raw.usageMetadata)
        ? (raw.usageMetadata as Record<string, unknown>)
        : {},
    finish_reason: String(firstCandidate.finishReason || ""),
    tool_calls: toolCalls,
    assistant_message: assistantMessage,
  };
}

export async function listProviderModels(provider: LlmProviderConfig): Promise<RemoteLlmModel[]> {
  ensureProviderHasKey(provider);
  if (provider.type === "gemini") {
    return await listGeminiModels(provider);
  }
  return await listOpenAIModels(provider);
}

async function listOpenAIModels(provider: LlmProviderConfig): Promise<RemoteLlmModel[]> {
  const response = await fetch(normalizeOpenAIModelsUrl(provider.base_url), {
    method: "GET",
    headers: {
      authorization: `Bearer ${provider.api_key}`,
    },
  });
  const data = await parseJsonResponse(response);
  if (!response.ok) {
    throw new Error(`fetch models failed (${response.status}): ${extractErrorMessage(data, "")}`);
  }
  const raw = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  const items = Array.isArray(raw.data) ? raw.data : [];
  return items
    .map((item) => {
      const obj = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
      const id = String(obj.id || "").trim();
      return id ? { model: id, name: id } : null;
    })
    .filter((item): item is RemoteLlmModel => Boolean(item))
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function listGeminiModels(provider: LlmProviderConfig): Promise<RemoteLlmModel[]> {
  const models: RemoteLlmModel[] = [];
  let pageToken = "";
  for (let i = 0; i < 10; i += 1) {
    const url = new URL(withGeminiApiKey(normalizeGeminiModelsUrl(provider.base_url), provider.api_key));
    url.searchParams.set("pageSize", "1000");
    if (pageToken) {
      url.searchParams.set("pageToken", pageToken);
    }
    const response = await fetch(url.toString(), { method: "GET" });
    const data = await parseJsonResponse(response);
    if (!response.ok) {
      throw new Error(`fetch models failed (${response.status}): ${extractErrorMessage(data, "")}`);
    }
    const raw = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
    const items = Array.isArray(raw.models) ? raw.models : [];
    for (const item of items) {
      const obj = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
      const model = String(obj.name || "").trim();
      if (!model) {
        continue;
      }
      const methods = Array.isArray(obj.supportedGenerationMethods)
        ? obj.supportedGenerationMethods.map((entry) => String(entry || ""))
        : [];
      if (methods.length && !methods.includes("generateContent")) {
        continue;
      }
      const displayName = String(obj.displayName || "").trim();
      models.push({ model, name: displayName || model });
    }
    pageToken = String(raw.nextPageToken || "").trim();
    if (!pageToken) {
      break;
    }
  }
  return models.sort((a, b) => a.name.localeCompare(b.name));
}

function resolveConfiguredModel(
  env: Record<string, unknown>,
  modelId: string
): { provider: LlmProviderConfig; model: LlmModelConfig } | null {
  const config = readRuntimeConfig(env);
  if (!config) {
    return null;
  }
  const selected = String(modelId || "").trim();
  if (!selected) {
    const firstEnabled = Object.values(config.models).find((model) => model.enabled);
    if (!firstEnabled) {
      return null;
    }
    const provider = config.providers[firstEnabled.provider_id];
    return provider ? { provider, model: firstEnabled } : null;
  }
  const direct = config.models[selected];
  if (direct) {
    const provider = config.providers[direct.provider_id];
    return provider ? { provider, model: direct } : null;
  }
  const byProviderModel = Object.values(config.models).find(
    (model) => model.enabled && (model.model === selected || model.name === selected)
  );
  if (byProviderModel) {
    const provider = config.providers[byProviderModel.provider_id];
    return provider ? { provider, model: byProviderModel } : null;
  }
  if (Object.keys(config.models).length > 0) {
    throw new Error(`LLM model is not configured or not enabled: ${selected}`);
  }
  return null;
}

export async function callConfiguredLlmChat(
  env: Record<string, unknown>,
  request: LlmChatRequest
): Promise<LlmChatResult> {
  const selected = resolveConfiguredModel(env, String(request.modelId || request.model || ""));
  if (selected) {
    if (!selected.model.enabled) {
      throw new Error(`LLM model is disabled: ${selected.model.name || selected.model.model}`);
    }
    ensureProviderReady(selected.provider);
    const result =
      selected.provider.type === "gemini"
        ? await callGeminiChat(selected.provider, selected.model.model, request)
        : await callOpenAIProviderChat(selected.provider, selected.model.model, request);
    return {
      ...result,
      provider_id: selected.provider.id,
      provider_type: selected.provider.type,
    };
  }

  return await callOpenAICompatibleChat(env, {
    ...request,
    model: request.model || request.modelId,
  });
}

export async function callConfiguredLlmToolChat(
  env: Record<string, unknown>,
  request: LlmToolChatRequest
): Promise<LlmToolChatResult> {
  const selected = resolveConfiguredModel(env, String(request.modelId || request.model || ""));
  if (selected) {
    if (!selected.model.enabled) {
      throw new Error(`LLM model is disabled: ${selected.model.name || selected.model.model}`);
    }
    ensureProviderReady(selected.provider);
    const result =
      selected.provider.type === "gemini"
        ? await callGeminiToolChat(selected.provider, selected.model.model, request)
        : await callOpenAIProviderToolChat(selected.provider, selected.model.model, request);
    return {
      ...result,
      provider_id: selected.provider.id,
      provider_type: selected.provider.type,
    };
  }

  return await callOpenAICompatibleToolChat(env, {
    ...request,
    model: request.model || request.modelId,
  });
}

export async function callOpenAICompatibleToolChat(
  env: Record<string, unknown>,
  request: LlmToolChatRequest
): Promise<LlmToolChatResult> {
  const apiKey = readEnv(env, "OPENAI_API_KEY") || readEnv(env, "LLM_API_KEY");
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY or LLM_API_KEY is not configured");
  }

  const model = String(request.model || readEnv(env, "OPENAI_DEFAULT_MODEL") || "").trim();
  if (!model) {
    throw new Error("model is required; select an enabled LLM model or set OPENAI_DEFAULT_MODEL");
  }

  return await callOpenAIProviderToolChat(
    {
      api_key: apiKey,
      base_url: readEnv(env, "OPENAI_BASE_URL") || defaultBaseUrlForProvider("openai"),
    },
    model,
    request
  );
}

export async function callOpenAICompatibleChat(
  env: Record<string, unknown>,
  request: OpenAICompatibleChatRequest
): Promise<OpenAICompatibleChatResult> {
  const apiKey = readEnv(env, "OPENAI_API_KEY") || readEnv(env, "LLM_API_KEY");
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY or LLM_API_KEY is not configured");
  }

  const model = String(request.model || readEnv(env, "OPENAI_DEFAULT_MODEL") || "").trim();
  if (!model) {
    throw new Error("model is required; select an enabled LLM model or set OPENAI_DEFAULT_MODEL");
  }

  return await callOpenAIProviderChat(
    {
      api_key: apiKey,
      base_url: readEnv(env, "OPENAI_BASE_URL") || defaultBaseUrlForProvider("openai"),
    },
    model,
    request
  );
}
