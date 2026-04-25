import type { ModularActionDefinition } from "../../modularActions";

export const definition: ModularActionDefinition = {
  id: "llm_generate",
  version: "1.0.0",
  name: "LLM Generate",
  description: "Call an enabled LLM model and return text or JSON.",
  category: "data",
  tags: ["llm", "ai", "generate", "openai", "gemini"],
  inputs: [
    {
      name: "llm_model",
      type: "string",
      required: true,
      default: "",
      options_source: "llm_models",
      description: "Enabled LLM model from the LLM Config page.",
    },
    {
      name: "system_prompt",
      type: "string",
      default: "",
      description: "System prompt. Keep secrets out of prompts.",
    },
    {
      name: "user_prompt",
      type: "string",
      required: true,
      description: "User prompt. Supports workflow templates.",
    },
    {
      name: "temperature",
      type: "number",
      default: 0.2,
      description: "Sampling temperature, 0 to 2.",
    },
    {
      name: "max_tokens",
      type: "integer",
      default: 512,
      description: "Maximum output tokens.",
    },
    {
      name: "response_mode",
      type: "string",
      default: "text",
      options: [
        { value: "text", label: "text" },
        { value: "json", label: "json" },
      ],
      description: "Use text for normal replies or json for structured output.",
    },
    {
      name: "json_schema",
      type: "string",
      default: "",
      description: "Optional JSON schema object used when response_mode=json.",
    },
    {
      name: "fail_on_error",
      type: "boolean",
      default: true,
      description: "Throw on request or JSON parsing errors. Disable to return error fields.",
    },
  ],
  outputs: [
    { name: "text", type: "string", description: "Model text output." },
    { name: "json", type: "any", description: "Parsed JSON output when response_mode=json." },
    { name: "raw", type: "any", description: "Raw provider response or preview payload." },
    { name: "model", type: "string", description: "Model used by the provider." },
    { name: "usage", type: "any", description: "Token usage returned by the provider." },
    { name: "finish_reason", type: "string", description: "Provider finish reason." },
    { name: "is_valid", type: "boolean", description: "Whether the request and output parsing succeeded." },
    { name: "error", type: "string", description: "Error message when failed." },
  ],
  i18n: {
    name: { "zh-CN": "LLM 生成", "en-US": "LLM Generate" },
    description: {
      "zh-CN": "调用已启用的 LLM 模型并返回文本或 JSON。",
      "en-US": "Call an enabled LLM model and return text or JSON.",
    },
    inputs: {
      llm_model: { label: { "zh-CN": "LLM 模型", "en-US": "LLM Model" } },
      system_prompt: { label: { "zh-CN": "系统提示词", "en-US": "System Prompt" } },
      user_prompt: { label: { "zh-CN": "用户提示词", "en-US": "User Prompt" } },
      temperature: { label: { "zh-CN": "温度", "en-US": "Temperature" } },
      max_tokens: { label: { "zh-CN": "最大 Tokens", "en-US": "Max Tokens" } },
      response_mode: { label: { "zh-CN": "响应模式", "en-US": "Response Mode" } },
      json_schema: { label: { "zh-CN": "JSON Schema", "en-US": "JSON Schema" } },
      fail_on_error: { label: { "zh-CN": "失败即报错", "en-US": "Fail On Error" } },
    },
    outputs: {
      text: { label: { "zh-CN": "文本", "en-US": "Text" } },
      json: { label: { "zh-CN": "JSON", "en-US": "JSON" } },
      raw: { label: { "zh-CN": "原始响应", "en-US": "Raw" } },
      usage: { label: { "zh-CN": "用量", "en-US": "Usage" } },
      is_valid: { label: { "zh-CN": "是否有效", "en-US": "Is Valid" } },
      error: { label: { "zh-CN": "错误", "en-US": "Error" } },
    },
  },
  ui: {
    icon: "sparkles",
    color: "#0f766e",
    group: "data",
  },
  runtime: {
    execution: "local",
    sideEffects: false,
    allowNetwork: true,
  },
  compatibility: {
    engineVersion: ">=0.1.0",
  },
};
