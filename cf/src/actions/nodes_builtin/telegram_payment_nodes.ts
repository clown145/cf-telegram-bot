import type { ActionHandler } from "../handlers";
import { callTelegram } from "../telegram";
import type { ModularActionDefinition } from "../modularActions";

type NodePackage = {
  definition: ModularActionDefinition;
  handler: ActionHandler;
};

function text(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  return typeof value === "string" ? value : String(value);
}

function parseJsonArray(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value;
  }
  const raw = text(value).trim();
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function telegramOkHandler(
  method: string,
  buildPayload: (params: Record<string, unknown>) => Record<string, unknown>
): ActionHandler {
  return async (params, context) => {
    const payload = buildPayload(params);
    if (context.preview) {
      return { ok: true };
    }
    const response = await callTelegram(context.env as any, method, payload);
    return {
      ok: Boolean((response as any).ok ?? true),
      result: (response as any).result ?? true,
    };
  };
}

const answerPreCheckoutQueryHandler = telegramOkHandler("answerPreCheckoutQuery", (params) => {
  const id = text(params.pre_checkout_query_id || params.query_id).trim();
  if (!id) {
    throw new Error("pre_checkout_query_id is required");
  }
  const ok = params.ok === undefined ? true : Boolean(params.ok);
  const payload: Record<string, unknown> = {
    pre_checkout_query_id: id,
    ok,
  };
  const errorMessage = text(params.error_message).trim();
  if (!ok && errorMessage) {
    payload.error_message = errorMessage;
  }
  return payload;
});

const answerShippingQueryHandler = telegramOkHandler("answerShippingQuery", (params) => {
  const id = text(params.shipping_query_id || params.query_id).trim();
  if (!id) {
    throw new Error("shipping_query_id is required");
  }
  const ok = params.ok === undefined ? true : Boolean(params.ok);
  const payload: Record<string, unknown> = {
    shipping_query_id: id,
    ok,
  };
  if (ok) {
    payload.shipping_options = parseJsonArray(params.shipping_options);
  } else {
    const errorMessage = text(params.error_message).trim();
    if (errorMessage) payload.error_message = errorMessage;
  }
  return payload;
});

const outputs = [
  { name: "ok", type: "boolean", description: "Whether Telegram accepted the operation." },
  { name: "result", type: "any", description: "Raw Telegram result." },
];

function makeDefinition(input: {
  id: string;
  name: string;
  zhName: string;
  description: string;
  inputs: ModularActionDefinition["inputs"];
}): ModularActionDefinition {
  return {
    id: input.id,
    version: "1.0.0",
    name: input.name,
    description: input.description,
    category: "telegram",
    tags: ["telegram", "payment"],
    inputs: input.inputs,
    outputs,
    i18n: {
      name: { "zh-CN": input.zhName, "en-US": input.name },
      description: { "zh-CN": input.description, "en-US": input.description },
    },
    ui: { icon: "credit-card", color: "#10b981", group: "telegram" },
    runtime: {
      execution: "local",
      sideEffects: true,
      allowNetwork: true,
    },
    compatibility: {
      engineVersion: ">=0.1.0",
    },
  };
}

export const TELEGRAM_PAYMENT_NODE_PACKAGES: NodePackage[] = [
  {
    definition: makeDefinition({
      id: "answer_pre_checkout_query",
      name: "Answer Pre Checkout Query",
      zhName: "回答支付确认",
      description: "Accept or reject a Telegram pre_checkout_query.",
      inputs: [
        { name: "pre_checkout_query_id", type: "string", required: true, description: "Pre-checkout query ID." },
        { name: "ok", type: "boolean", default: true, description: "Whether to accept checkout." },
        { name: "error_message", type: "string", default: "", description: "Required by Telegram when ok=false." },
      ],
    }),
    handler: answerPreCheckoutQueryHandler,
  },
  {
    definition: makeDefinition({
      id: "answer_shipping_query",
      name: "Answer Shipping Query",
      zhName: "回答配送查询",
      description: "Accept or reject a Telegram shipping_query.",
      inputs: [
        { name: "shipping_query_id", type: "string", required: true, description: "Shipping query ID." },
        { name: "ok", type: "boolean", default: true, description: "Whether shipping is available." },
        { name: "shipping_options", type: "string", default: "[]", description: "Shipping options JSON array when ok=true." },
        { name: "error_message", type: "string", default: "", description: "Required by Telegram when ok=false." },
      ],
    }),
    handler: answerShippingQueryHandler,
  },
];

export default TELEGRAM_PAYMENT_NODE_PACKAGES;
