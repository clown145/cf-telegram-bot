import type { ActionHandler } from "../handlers";
import type { ModularActionDefinition } from "../modularActions";

type NodePackage = {
  definition: ModularActionDefinition;
  handler: ActionHandler;
};

const eventTriggerHandler: ActionHandler = async (_params, context) => {
  const trigger = (context.runtime?.variables as any)?.__trigger__ || null;
  return { event: trigger };
};

const baseInputs: ModularActionDefinition["inputs"] = [
  { name: "enabled", type: "boolean", default: true, description: "Enable this trigger." },
  { name: "priority", type: "integer", default: 100, description: "Higher value runs first." },
];

const patternInputs: ModularActionDefinition["inputs"] = [
  {
    name: "match_mode",
    type: "string",
    default: "contains",
    options: [
      { value: "contains", label: "contains" },
      { value: "equals", label: "equals" },
      { value: "startsWith", label: "startsWith" },
      { value: "regex", label: "regex" },
    ],
    description: "Pattern match mode.",
  },
  { name: "case_sensitive", type: "boolean", default: false, description: "Use case-sensitive match." },
];

const eventOutput = [{ name: "event", type: "any", description: "Trigger event payload." }];

function makeDefinition(input: {
  id: string;
  name: string;
  zhName: string;
  description: string;
  inputs: ModularActionDefinition["inputs"];
  order: number;
}): ModularActionDefinition {
  return {
    id: input.id,
    version: "1.0.0",
    name: input.name,
    description: input.description,
    category: "trigger",
    tags: ["trigger", "telegram", "event"],
    inputs: input.inputs,
    outputs: eventOutput,
    i18n: {
      name: { "zh-CN": input.zhName, "en-US": input.name },
      description: { "zh-CN": input.description, "en-US": input.description },
    },
    ui: {
      icon: "bolt",
      color: "#a855f7",
      group: "trigger",
      order: input.order,
    },
    runtime: {
      execution: "local",
      sideEffects: false,
      allowNetwork: false,
    },
    compatibility: {
      engineVersion: ">=0.1.0",
    },
  };
}

export const EVENT_TRIGGER_NODE_PACKAGES: NodePackage[] = [
  {
    definition: makeDefinition({
      id: "trigger_pre_checkout_query",
      name: "Trigger: Pre Checkout Query",
      zhName: "触发器：支付确认",
      description: "Trigger workflow when Telegram pre_checkout_query update arrives.",
      order: 6,
      inputs: [
        ...baseInputs,
        { name: "payload_pattern", type: "string", default: "", description: "Optional invoice payload pattern." },
        { name: "currency", type: "string", default: "", description: "Optional currency filter." },
        ...patternInputs,
      ],
    }),
    handler: eventTriggerHandler,
  },
  {
    definition: makeDefinition({
      id: "trigger_shipping_query",
      name: "Trigger: Shipping Query",
      zhName: "触发器：配送查询",
      description: "Trigger workflow when Telegram shipping_query update arrives.",
      order: 7,
      inputs: [
        ...baseInputs,
        { name: "payload_pattern", type: "string", default: "", description: "Optional invoice payload pattern." },
        { name: "country_code", type: "string", default: "", description: "Optional shipping country filter." },
        ...patternInputs,
      ],
    }),
    handler: eventTriggerHandler,
  },
  {
    definition: makeDefinition({
      id: "trigger_channel_post",
      name: "Trigger: Channel Post",
      zhName: "触发器：频道消息",
      description: "Trigger workflow when Telegram channel_post update arrives.",
      order: 8,
      inputs: [
        ...baseInputs,
        { name: "chat_id", type: "string", default: "", description: "Optional channel chat ID filter." },
        { name: "text_pattern", type: "string", default: "", description: "Optional text/caption pattern." },
        ...patternInputs,
      ],
    }),
    handler: eventTriggerHandler,
  },
  {
    definition: makeDefinition({
      id: "trigger_edited_channel_post",
      name: "Trigger: Edited Channel Post",
      zhName: "触发器：编辑频道消息",
      description: "Trigger workflow when Telegram edited_channel_post update arrives.",
      order: 9,
      inputs: [
        ...baseInputs,
        { name: "chat_id", type: "string", default: "", description: "Optional channel chat ID filter." },
        { name: "text_pattern", type: "string", default: "", description: "Optional text/caption pattern." },
        ...patternInputs,
      ],
    }),
    handler: eventTriggerHandler,
  },
];

export default EVENT_TRIGGER_NODE_PACKAGES;
