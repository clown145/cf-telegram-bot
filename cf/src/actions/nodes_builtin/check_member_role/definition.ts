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
    name: { "zh-CN": "成员角色判断", "en-US": "Check Member Role" },
    description: {
      "zh-CN": "判断群成员角色并走 true/false 分支。",
      "en-US": "Evaluate a Telegram member status and route by role check result.",
    },
    inputs: {
      status: { label: { "zh-CN": "成员状态", "en-US": "Status" } },
      check: { label: { "zh-CN": "检查项", "en-US": "Check" } },
      expected: { label: { "zh-CN": "期望结果", "en-US": "Expected" } },
    },
    outputs: {
      true: { label: { "zh-CN": "匹配", "en-US": "True" } },
      false: { label: { "zh-CN": "不匹配", "en-US": "False" } },
      matched: { label: { "zh-CN": "判断结果", "en-US": "Matched" } },
      normalized_status: { label: { "zh-CN": "标准化状态", "en-US": "Normalized Status" } },
      is_admin: { label: { "zh-CN": "是否管理员", "en-US": "Is Admin" } },
      is_owner: { label: { "zh-CN": "是否群主", "en-US": "Is Owner" } },
      is_member: { label: { "zh-CN": "是否在群内", "en-US": "Is Member" } },
      is_restricted: { label: { "zh-CN": "是否受限", "en-US": "Is Restricted" } },
      is_left: { label: { "zh-CN": "是否离开", "en-US": "Is Left" } },
      is_banned: { label: { "zh-CN": "是否封禁", "en-US": "Is Banned" } },
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