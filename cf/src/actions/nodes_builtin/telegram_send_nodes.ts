import type { ActionHandler } from "../handlers";
import { buildReplyParameters } from "../nodeHelpers";
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

function requiredText(params: Record<string, unknown>, name: string): string {
  const value = text(params[name]).trim();
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function optionalText(params: Record<string, unknown>, name: string): string | undefined {
  const value = text(params[name]).trim();
  return value ? value : undefined;
}

function requiredNumber(params: Record<string, unknown>, name: string): number {
  const value = Number(params[name]);
  if (!Number.isFinite(value)) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function optionalNumber(params: Record<string, unknown>, name: string): number | undefined {
  if (params[name] === null || params[name] === undefined || params[name] === "") {
    return undefined;
  }
  const value = Number(params[name]);
  return Number.isFinite(value) ? value : undefined;
}

function optionalBoolean(params: Record<string, unknown>, name: string): boolean | undefined {
  if (params[name] === null || params[name] === undefined || params[name] === "") {
    return undefined;
  }
  return Boolean(params[name]);
}

function assignOptional(payload: Record<string, unknown>, params: Record<string, unknown>, names: string[]): void {
  for (const name of names) {
    const value = optionalText(params, name);
    if (value !== undefined) {
      payload[name] = value;
    }
  }
}

function assignOptionalNumbers(payload: Record<string, unknown>, params: Record<string, unknown>, names: string[]): void {
  for (const name of names) {
    const value = optionalNumber(params, name);
    if (value !== undefined) {
      payload[name] = value;
    }
  }
}

function assignOptionalBooleans(payload: Record<string, unknown>, params: Record<string, unknown>, names: string[]): void {
  for (const name of names) {
    const value = optionalBoolean(params, name);
    if (value !== undefined) {
      payload[name] = value;
    }
  }
}

function addReplyParameters(payload: Record<string, unknown>, params: Record<string, unknown>): void {
  const replyParameters = buildReplyParameters(params.reply_to_message_id);
  if (replyParameters) {
    payload.reply_parameters = replyParameters;
  }
}

function parseStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((entry) => text(entry).trim()).filter(Boolean);
  }
  const raw = text(value).trim();
  if (!raw) {
    return [];
  }
  if (raw.startsWith("[") && raw.endsWith("]")) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.map((entry) => text(entry).trim()).filter(Boolean);
      }
    } catch {
      // fall through to text split
    }
  }
  return raw
    .split(/\r?\n|,/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parsePrices(value: unknown): Array<{ label: string; amount: number }> {
  if (Array.isArray(value)) {
    return value
      .map((entry) => {
        const item = entry as Record<string, unknown>;
        return { label: text(item.label).trim(), amount: Number(item.amount) };
      })
      .filter((entry) => entry.label && Number.isFinite(entry.amount));
  }
  const raw = text(value).trim();
  if (!raw) {
    return [];
  }
  if (raw.startsWith("[") && raw.endsWith("]")) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsePrices(parsed);
      }
    } catch {
      // fall through to line parser
    }
  }
  return raw
    .split(/\r?\n/)
    .map((line) => {
      const [labelRaw, amountRaw] = line.includes(":") ? line.split(/:(.*)/s, 2) : line.split(/,(.*)/s, 2);
      return { label: text(labelRaw).trim(), amount: Number(text(amountRaw).trim()) };
    })
    .filter((entry) => entry.label && Number.isFinite(entry.amount));
}

function messageOutputs(response: Record<string, unknown>, extra?: Record<string, unknown>): Record<string, unknown> {
  const result = ((response as any).result || {}) as Record<string, unknown>;
  return {
    message_id: Number((result as any).message_id || 0),
    ...extra,
  };
}

function sendTelegramMessageNode(
  method: string,
  buildPayload: (params: Record<string, unknown>) => Record<string, unknown>,
  buildExtra?: (response: Record<string, unknown>) => Record<string, unknown>
): ActionHandler {
  return async (params, context) => {
    const payload = buildPayload(params);
    if (context.preview) {
      return { message_id: 0, ...(buildExtra ? buildExtra({ result: {} }) : {}) };
    }
    const response = await callTelegram(context.env as any, method, payload);
    return messageOutputs(response, buildExtra ? buildExtra(response) : undefined);
  };
}

const sendStickerHandler = sendTelegramMessageNode("sendSticker", (params) => {
  const payload: Record<string, unknown> = {
    chat_id: requiredText(params, "chat_id"),
    sticker: requiredText(params, "sticker"),
  };
  addReplyParameters(payload, params);
  assignOptionalNumbers(payload, params, ["message_thread_id"]);
  assignOptionalBooleans(payload, params, ["disable_notification", "protect_content"]);
  return payload;
});

const sendLocationHandler = sendTelegramMessageNode("sendLocation", (params) => {
  const payload: Record<string, unknown> = {
    chat_id: requiredText(params, "chat_id"),
    latitude: requiredNumber(params, "latitude"),
    longitude: requiredNumber(params, "longitude"),
  };
  addReplyParameters(payload, params);
  assignOptionalNumbers(payload, params, [
    "horizontal_accuracy",
    "live_period",
    "heading",
    "proximity_alert_radius",
    "message_thread_id",
  ]);
  assignOptionalBooleans(payload, params, ["disable_notification", "protect_content"]);
  return payload;
});

const sendVenueHandler = sendTelegramMessageNode("sendVenue", (params) => {
  const payload: Record<string, unknown> = {
    chat_id: requiredText(params, "chat_id"),
    latitude: requiredNumber(params, "latitude"),
    longitude: requiredNumber(params, "longitude"),
    title: requiredText(params, "title"),
    address: requiredText(params, "address"),
  };
  addReplyParameters(payload, params);
  assignOptional(payload, params, ["foursquare_id", "foursquare_type", "google_place_id", "google_place_type"]);
  assignOptionalNumbers(payload, params, ["message_thread_id"]);
  assignOptionalBooleans(payload, params, ["disable_notification", "protect_content"]);
  return payload;
});

const sendContactHandler = sendTelegramMessageNode("sendContact", (params) => {
  const payload: Record<string, unknown> = {
    chat_id: requiredText(params, "chat_id"),
    phone_number: requiredText(params, "phone_number"),
    first_name: requiredText(params, "first_name"),
  };
  addReplyParameters(payload, params);
  assignOptional(payload, params, ["last_name", "vcard"]);
  assignOptionalNumbers(payload, params, ["message_thread_id"]);
  assignOptionalBooleans(payload, params, ["disable_notification", "protect_content"]);
  return payload;
});

const sendPollHandler = sendTelegramMessageNode("sendPoll", (params) => {
  const options = parseStringList(params.options);
  if (options.length < 2) {
    throw new Error("options must contain at least 2 choices");
  }
  if (options.length > 10) {
    throw new Error("options must contain at most 10 choices");
  }
  const payload: Record<string, unknown> = {
    chat_id: requiredText(params, "chat_id"),
    question: requiredText(params, "question"),
    options,
  };
  addReplyParameters(payload, params);
  assignOptional(payload, params, ["type", "explanation", "explanation_parse_mode"]);
  assignOptionalNumbers(payload, params, ["correct_option_id", "open_period", "close_date", "message_thread_id"]);
  assignOptionalBooleans(payload, params, [
    "is_anonymous",
    "allows_multiple_answers",
    "is_closed",
    "disable_notification",
    "protect_content",
  ]);
  return payload;
}, (response) => {
  const result = ((response as any).result || {}) as any;
  return {
    poll_id: result.poll?.id || "",
  };
});

const sendDiceHandler = sendTelegramMessageNode("sendDice", (params) => {
  const payload: Record<string, unknown> = {
    chat_id: requiredText(params, "chat_id"),
  };
  const emoji = optionalText(params, "emoji");
  if (emoji) payload.emoji = emoji;
  addReplyParameters(payload, params);
  assignOptionalNumbers(payload, params, ["message_thread_id"]);
  assignOptionalBooleans(payload, params, ["disable_notification", "protect_content"]);
  return payload;
}, (response) => {
  const result = ((response as any).result || {}) as any;
  return {
    dice_value: Number(result.dice?.value || 0),
    emoji: result.dice?.emoji || "",
  };
});

const sendInvoiceHandler = sendTelegramMessageNode("sendInvoice", (params) => {
  const prices = parsePrices(params.prices);
  if (!prices.length) {
    throw new Error("prices must contain at least one labeled price");
  }
  const payload: Record<string, unknown> = {
    chat_id: requiredText(params, "chat_id"),
    title: requiredText(params, "title"),
    description: requiredText(params, "description"),
    payload: requiredText(params, "payload"),
    provider_token: requiredText(params, "provider_token"),
    currency: requiredText(params, "currency"),
    prices,
  };
  addReplyParameters(payload, params);
  assignOptional(payload, params, [
    "start_parameter",
    "provider_data",
    "photo_url",
  ]);
  assignOptionalNumbers(payload, params, ["photo_size", "photo_width", "photo_height", "max_tip_amount", "message_thread_id"]);
  const suggestedTipAmounts = parseStringList(params.suggested_tip_amounts)
    .map((entry) => Number(entry))
    .filter((entry) => Number.isFinite(entry) && entry > 0);
  if (suggestedTipAmounts.length) {
    payload.suggested_tip_amounts = suggestedTipAmounts;
  }
  assignOptionalBooleans(payload, params, [
    "need_name",
    "need_phone_number",
    "need_email",
    "need_shipping_address",
    "send_phone_number_to_provider",
    "send_email_to_provider",
    "is_flexible",
    "disable_notification",
    "protect_content",
  ]);
  return payload;
});

function commonMessageInputs(extra: ModularActionDefinition["inputs"]): ModularActionDefinition["inputs"] {
  return [
    { name: "chat_id", type: "string", required: true, description: "Target chat ID." },
    ...extra,
    { name: "reply_to_message_id", type: "integer", default: null, description: "Optional message to reply to." },
    { name: "message_thread_id", type: "integer", default: null, description: "Optional forum topic/thread ID." },
    { name: "disable_notification", type: "boolean", default: false, description: "Send silently." },
    { name: "protect_content", type: "boolean", default: false, description: "Protect content from forwarding/saving." },
  ];
}

const messageIdOutput = [{ name: "message_id", type: "integer", description: "New message ID." }];
const telegramRuntime = {
  execution: "local" as const,
  sideEffects: true,
  allowNetwork: true,
};

function makeDefinition(input: {
  id: string;
  name: string;
  zhName: string;
  description: string;
  inputs: ModularActionDefinition["inputs"];
  outputs?: ModularActionDefinition["outputs"];
  icon: string;
  color: string;
}): ModularActionDefinition {
  return {
    id: input.id,
    version: "1.0.0",
    name: input.name,
    description: input.description,
    category: "messaging",
    tags: ["telegram", "message", "send"],
    inputs: input.inputs,
    outputs: input.outputs || messageIdOutput,
    i18n: {
      name: { "zh-CN": input.zhName, "en-US": input.name },
      description: { "zh-CN": input.description, "en-US": input.description },
    },
    ui: { icon: input.icon, color: input.color, group: "message" },
    runtime: telegramRuntime,
    compatibility: { engineVersion: ">=0.1.0" },
  };
}

export const TELEGRAM_SEND_NODE_PACKAGES: NodePackage[] = [
  {
    definition: makeDefinition({
      id: "send_sticker",
      name: "Send Sticker",
      zhName: "发送贴纸",
      description: "Send a Telegram sticker by file_id or URL.",
      icon: "sticker",
      color: "#38bdf8",
      inputs: commonMessageInputs([
        { name: "sticker", type: "string", required: true, description: "Sticker file_id or URL." },
      ]),
    }),
    handler: sendStickerHandler,
  },
  {
    definition: makeDefinition({
      id: "send_location",
      name: "Send Location",
      zhName: "发送位置",
      description: "Send a geographic location.",
      icon: "map-pin",
      color: "#22c55e",
      inputs: commonMessageInputs([
        { name: "latitude", type: "number", required: true, description: "Latitude." },
        { name: "longitude", type: "number", required: true, description: "Longitude." },
        { name: "horizontal_accuracy", type: "number", default: null, description: "Horizontal accuracy in meters." },
        { name: "live_period", type: "integer", default: null, description: "Live location period in seconds." },
        { name: "heading", type: "integer", default: null, description: "Movement heading." },
        { name: "proximity_alert_radius", type: "integer", default: null, description: "Proximity alert radius." },
      ]),
    }),
    handler: sendLocationHandler,
  },
  {
    definition: makeDefinition({
      id: "send_venue",
      name: "Send Venue",
      zhName: "发送地点",
      description: "Send venue information.",
      icon: "map",
      color: "#0ea5e9",
      inputs: commonMessageInputs([
        { name: "latitude", type: "number", required: true, description: "Latitude." },
        { name: "longitude", type: "number", required: true, description: "Longitude." },
        { name: "title", type: "string", required: true, description: "Venue title." },
        { name: "address", type: "string", required: true, description: "Venue address." },
        { name: "foursquare_id", type: "string", default: "", description: "Foursquare ID." },
        { name: "foursquare_type", type: "string", default: "", description: "Foursquare type." },
        { name: "google_place_id", type: "string", default: "", description: "Google Place ID." },
        { name: "google_place_type", type: "string", default: "", description: "Google Place type." },
      ]),
    }),
    handler: sendVenueHandler,
  },
  {
    definition: makeDefinition({
      id: "send_contact",
      name: "Send Contact",
      zhName: "发送联系人",
      description: "Send a phone contact.",
      icon: "user",
      color: "#f97316",
      inputs: commonMessageInputs([
        { name: "phone_number", type: "string", required: true, description: "Phone number." },
        { name: "first_name", type: "string", required: true, description: "First name." },
        { name: "last_name", type: "string", default: "", description: "Last name." },
        { name: "vcard", type: "string", default: "", description: "vCard content." },
      ]),
    }),
    handler: sendContactHandler,
  },
  {
    definition: makeDefinition({
      id: "send_poll",
      name: "Send Poll",
      zhName: "发送投票",
      description: "Send a poll or quiz. Options support JSON array, comma-separated, or newline-separated text.",
      icon: "bar-chart",
      color: "#a855f7",
      inputs: commonMessageInputs([
        { name: "question", type: "string", required: true, description: "Poll question." },
        { name: "options", type: "string", required: true, description: "Poll options." },
        {
          name: "type",
          type: "string",
          default: "regular",
          options: [
            { value: "regular", label: "regular" },
            { value: "quiz", label: "quiz" },
          ],
          description: "Poll type.",
        },
        { name: "is_anonymous", type: "boolean", default: true, description: "Anonymous poll." },
        { name: "allows_multiple_answers", type: "boolean", default: false, description: "Allow multiple answers." },
        { name: "correct_option_id", type: "integer", default: null, description: "Correct option for quiz." },
        { name: "explanation", type: "string", default: "", description: "Quiz explanation." },
        { name: "explanation_parse_mode", type: "string", default: "", description: "Explanation parse mode." },
        { name: "open_period", type: "integer", default: null, description: "Open period in seconds." },
        { name: "close_date", type: "integer", default: null, description: "Close timestamp." },
        { name: "is_closed", type: "boolean", default: false, description: "Send as closed poll." },
      ]),
      outputs: [
        ...messageIdOutput,
        { name: "poll_id", type: "string", description: "Telegram poll ID." },
      ],
    }),
    handler: sendPollHandler,
  },
  {
    definition: makeDefinition({
      id: "send_dice",
      name: "Send Dice",
      zhName: "发送骰子",
      description: "Send a dice/game emoji animation.",
      icon: "dice",
      color: "#eab308",
      inputs: commonMessageInputs([
        {
          name: "emoji",
          type: "string",
          default: "",
          options: [
            { value: "", label: "default" },
            { value: "🎲", label: "🎲" },
            { value: "🎯", label: "🎯" },
            { value: "🏀", label: "🏀" },
            { value: "⚽", label: "⚽" },
            { value: "🎳", label: "🎳" },
            { value: "🎰", label: "🎰" },
          ],
          description: "Dice emoji.",
        },
      ]),
      outputs: [
        ...messageIdOutput,
        { name: "dice_value", type: "integer", description: "Dice result value." },
        { name: "emoji", type: "string", description: "Dice emoji." },
      ],
    }),
    handler: sendDiceHandler,
  },
  {
    definition: makeDefinition({
      id: "send_invoice",
      name: "Send Invoice",
      zhName: "发送支付请求",
      description: "Send a Telegram invoice. Prices support JSON or lines like label:amount.",
      icon: "credit-card",
      color: "#10b981",
      inputs: commonMessageInputs([
        { name: "title", type: "string", required: true, description: "Product name." },
        { name: "description", type: "string", required: true, description: "Product description." },
        { name: "payload", type: "string", required: true, description: "Bot-defined invoice payload." },
        { name: "provider_token", type: "string", required: true, description: "Payment provider token." },
        { name: "currency", type: "string", required: true, default: "USD", description: "Three-letter ISO 4217 currency." },
        { name: "prices", type: "string", required: true, description: "JSON prices or lines like Product:999." },
        { name: "start_parameter", type: "string", default: "", description: "Deep-linking start parameter." },
        { name: "provider_data", type: "string", default: "", description: "Provider-specific JSON string." },
        { name: "photo_url", type: "string", default: "", description: "Product photo URL." },
        { name: "photo_size", type: "integer", default: null, description: "Photo size." },
        { name: "photo_width", type: "integer", default: null, description: "Photo width." },
        { name: "photo_height", type: "integer", default: null, description: "Photo height." },
        { name: "max_tip_amount", type: "integer", default: null, description: "Maximum accepted tip amount." },
        { name: "suggested_tip_amounts", type: "string", default: "", description: "Comma-separated suggested tip amounts." },
        { name: "need_name", type: "boolean", default: false, description: "Require name." },
        { name: "need_phone_number", type: "boolean", default: false, description: "Require phone number." },
        { name: "need_email", type: "boolean", default: false, description: "Require email." },
        { name: "need_shipping_address", type: "boolean", default: false, description: "Require shipping address." },
        { name: "send_phone_number_to_provider", type: "boolean", default: false, description: "Send phone to provider." },
        { name: "send_email_to_provider", type: "boolean", default: false, description: "Send email to provider." },
        { name: "is_flexible", type: "boolean", default: false, description: "Enable shipping query flow." },
      ]),
    }),
    handler: sendInvoiceHandler,
  },
];

export default TELEGRAM_SEND_NODE_PACKAGES;
