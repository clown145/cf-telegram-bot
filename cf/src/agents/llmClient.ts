export interface OpenAICompatibleChatRequest {
  systemPrompt?: string;
  userPrompt: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  responseMode?: "text" | "json";
  jsonSchema?: string;
}

export interface OpenAICompatibleChatResult {
  text: string;
  raw: Record<string, unknown>;
  model: string;
  usage: Record<string, unknown>;
  finish_reason: string;
}

function readEnv(env: Record<string, unknown>, name: string): string {
  const value = env[name];
  return typeof value === "string" ? value.trim() : "";
}

function normalizeChatUrl(baseUrl: string): string {
  const base = (baseUrl || "https://api.openai.com/v1").trim().replace(/\/+$/, "");
  if (/\/chat\/completions$/i.test(base)) {
    return base;
  }
  return `${base}/chat/completions`;
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

function buildResponseFormat(mode: "text" | "json", jsonSchema: string): Record<string, unknown> | undefined {
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
    throw new Error("model is required; set node model or OPENAI_DEFAULT_MODEL");
  }

  const userPrompt = String(request.userPrompt || "").trim();
  if (!userPrompt) {
    throw new Error("user_prompt is required");
  }

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

  const responseFormat = buildResponseFormat(mode, request.jsonSchema || "");
  if (responseFormat) {
    payload.response_format = responseFormat;
  }

  const baseUrl = readEnv(env, "OPENAI_BASE_URL") || "https://api.openai.com/v1";
  const response = await fetch(normalizeChatUrl(baseUrl), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  const bodyText = await response.text();
  let data: unknown = {};
  if (bodyText) {
    try {
      data = JSON.parse(bodyText);
    } catch {
      data = { message: bodyText };
    }
  }

  if (!response.ok) {
    throw new Error(`LLM request failed (${response.status}): ${extractErrorMessage(data, bodyText)}`);
  }

  const raw = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  const choices = Array.isArray(raw.choices) ? raw.choices : [];
  const firstChoice = (choices[0] || {}) as Record<string, unknown>;
  const message = (firstChoice.message || {}) as Record<string, unknown>;
  const content = message.content === undefined || message.content === null ? "" : String(message.content);

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
