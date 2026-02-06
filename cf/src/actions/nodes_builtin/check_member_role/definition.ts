import type { ModularActionDefinition } from "../../modularActions";

export const definition: ModularActionDefinition = {
  id: "check_member_role",
  version: "1.0.0",
  name: "Check Member Role",
  description: "Evaluate a Telegram member status and route by role check result.",
  category: "control",
  tags: ["telegram", "role", "condition"],
  inputs: [
    {
      name: "status",
      type: "string",
      default: "{{ variables.status }}",
      required: true,
      description: "Member status from get_chat_member, such as member/administrator/owner.",
    },
    {
      name: "check",
      type: "string",
      default: "is_admin",
      options: [
        { value: "is_admin", label: "is_admin" },
        { value: "is_owner", label: "is_owner" },
        { value: "is_member", label: "is_member" },
        { value: "is_restricted", label: "is_restricted" },
        { value: "is_left", label: "is_left" },
        { value: "is_banned", label: "is_banned" },
      ],
      description: "Role condition to evaluate.",
    },
    {
      name: "expected",
      type: "boolean",
      default: true,
      description: "Expected check result. false means logical negation.",
    },
  ],
  outputs: [
    { name: "true", type: "flow", description: "Condition matched." },
    { name: "false", type: "flow", description: "Condition not matched." },
    { name: "matched", type: "boolean", description: "Final matched result." },
    { name: "normalized_status", type: "string", description: "Normalized status." },
    { name: "is_admin", type: "boolean", description: "Whether user is admin or owner." },
    { name: "is_owner", type: "boolean", description: "Whether user is owner." },
    { name: "is_member", type: "boolean", description: "Whether user currently belongs to the chat." },
    { name: "is_restricted", type: "boolean", description: "Whether user is restricted." },
    { name: "is_left", type: "boolean", description: "Whether user left the chat." },
    { name: "is_banned", type: "boolean", description: "Whether user is banned (kicked)." },
  ],
  i18n: {
    name: { "zh-CN": "\u6210\u5458\u89d2\u8272\u5224\u65ad", "en-US": "Check Member Role" },
    description: {
      "zh-CN": "\u5224\u65ad\u7fa4\u6210\u5458\u89d2\u8272\u5e76\u8d70 true/false \u5206\u652f\u3002",
      "en-US": "Evaluate a Telegram member status and route by role check result.",
    },
    inputs: {
      status: { label: { "zh-CN": "\u6210\u5458\u72b6\u6001", "en-US": "Status" } },
      check: { label: { "zh-CN": "\u68c0\u67e5\u9879", "en-US": "Check" } },
      expected: { label: { "zh-CN": "\u671f\u671b\u7ed3\u679c", "en-US": "Expected" } },
    },
    outputs: {
      true: { label: { "zh-CN": "\u5339\u914d", "en-US": "True" } },
      false: { label: { "zh-CN": "\u4e0d\u5339\u914d", "en-US": "False" } },
      matched: { label: { "zh-CN": "\u5224\u65ad\u7ed3\u679c", "en-US": "Matched" } },
      normalized_status: { label: { "zh-CN": "\u6807\u51c6\u5316\u72b6\u6001", "en-US": "Normalized Status" } },
      is_admin: { label: { "zh-CN": "\u662f\u5426\u7ba1\u7406\u5458", "en-US": "Is Admin" } },
      is_owner: { label: { "zh-CN": "\u662f\u5426\u7fa4\u4e3b", "en-US": "Is Owner" } },
      is_member: { label: { "zh-CN": "\u662f\u5426\u5728\u7fa4\u5185", "en-US": "Is Member" } },
      is_restricted: { label: { "zh-CN": "\u662f\u5426\u53d7\u9650", "en-US": "Is Restricted" } },
      is_left: { label: { "zh-CN": "\u662f\u5426\u79bb\u5f00", "en-US": "Is Left" } },
      is_banned: { label: { "zh-CN": "\u662f\u5426\u5c01\u7981", "en-US": "Is Banned" } },
    },
  },
  ui: {
    icon: "shield",
    color: "#22c55e",
    group: "Control",
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
