import { callOpenAICompatibleChat } from "../../../agents/llmClient";
import type { ActionHandler } from "../../handlers";

function toBool(value: unknown, fallback: boolean): boolean {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  if (typeof value === "boolean") {
    return value;
  }
  const normalized = String(value).trim().toLowerCase();
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  return Boolean(value);
}

function stripJsonFence(value: string): string {
  const trimmed = value.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1].trim() : trimmed;
}

function parseJsonOutput(value: string): unknown {
  return JSON.parse(stripJsonFence(value));
}

function errorResult(error: unknown): Record<string, unknown> {
  return {
    text: "",
    json: null,
    raw: null,
    model: "",
    usage: {},
    finish_reason: "",
    is_valid: false,
    error: String(error),
  };
}

export const handler: ActionHandler = async (params, context) => {
  const responseMode = String(params.response_mode || "text").trim().toLowerCase() === "json" ? "json" : "text";
  const failOnError = toBool(params.fail_on_error, true);
  const systemPrompt = String(params.system_prompt || "");
  const userPrompt = String(params.user_prompt || "");
  const model = String(params.model || context.env.OPENAI_DEFAULT_MODEL || "");

  if (context.preview) {
    return {
      text: "[preview] LLM call skipped.",
      json: responseMode === "json" ? {} : null,
      raw: {
        preview: true,
        provider: "openai_compatible",
        model,
        response_mode: responseMode,
        system_prompt_chars: systemPrompt.length,
        user_prompt_chars: userPrompt.length,
      },
      model,
      usage: {},
      finish_reason: "preview",
      is_valid: true,
      error: "",
    };
  }

  try {
    const result = await callOpenAICompatibleChat(context.env, {
      systemPrompt,
      userPrompt,
      model,
      temperature: Number(params.temperature),
      maxTokens: Number(params.max_tokens),
      responseMode,
      jsonSchema: String(params.json_schema || ""),
    });

    let parsedJson: unknown = null;
    if (responseMode === "json") {
      try {
        parsedJson = parseJsonOutput(result.text);
      } catch (error) {
        if (failOnError) {
          throw new Error(`LLM response was not valid JSON: ${String(error)}`);
        }
        return {
          text: result.text,
          json: null,
          raw: result.raw,
          model: result.model,
          usage: result.usage,
          finish_reason: result.finish_reason,
          is_valid: false,
          error: `LLM response was not valid JSON: ${String(error)}`,
        };
      }
    }

    return {
      text: result.text,
      json: parsedJson,
      raw: result.raw,
      model: result.model,
      usage: result.usage,
      finish_reason: result.finish_reason,
      is_valid: true,
      error: "",
    };
  } catch (error) {
    if (failOnError) {
      throw error;
    }
    return errorResult(error);
  }
};
