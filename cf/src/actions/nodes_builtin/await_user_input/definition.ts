import type { ModularActionDefinition } from "../../modularActions";

export const definition: ModularActionDefinition = {
  id: "await_user_input",
  version: "1.0.0",
  name: "等待用户输入 (Await User Input)",
  description: "提示用户输入并在收到回复后继续工作流。",
  category: "input",
  tags: ["await", "input", "telegram"],
  inputs: [
    {
      name: "prompt_template",
      type: "string",
      required: false,
      default: "请输入内容：",
      description: "提示消息（支持模板）。",
    },
    {
      name: "prompt_display_mode",
      type: "string",
      required: false,
      default: "button_label",
      description: "提示展示方式。",
      enum: ["button_label", "menu_title", "message_text"],
      enum_labels: {
        button_label: "修改按钮标题",
        menu_title: "更新菜单标题",
        message_text: "替换消息文本",
      },
    },
    {
      name: "timeout_seconds",
      type: "integer",
      required: false,
      default: 60,
      description: "等待超时（秒）。",
    },
    {
      name: "allow_empty",
      type: "boolean",
      required: false,
      default: false,
      description: "是否允许空输入。",
    },
    {
      name: "retry_prompt_template",
      type: "string",
      required: false,
      description: "空输入时的重新提示。",
    },
    {
      name: "success_template",
      type: "string",
      required: false,
      description: "成功收到输入后的提示。",
    },
    {
      name: "timeout_template",
      type: "string",
      required: false,
      default: "输入超时，操作已取消。",
      description: "超时后的提示。",
    },
    {
      name: "cancel_keywords",
      type: "string",
      required: false,
      description: "取消关键字（逗号或换行分隔）。",
    },
    {
      name: "cancel_template",
      type: "string",
      required: false,
      description: "取消后的提示。",
    },
    {
      name: "parse_mode",
      type: "string",
      required: false,
      default: "html",
      description: "解析模式。",
      enum: ["html", "markdown", "markdownv2", "none"],
      enum_labels: {
        html: "HTML",
        markdown: "Markdown",
        markdownv2: "MarkdownV2",
        none: "纯文本",
      },
    },
  ],
  outputs: [
    { name: "user_input", type: "string", description: "用户输入文本。" },
    { name: "user_input_status", type: "string", description: "输入状态（success/timeout/cancelled）。" },
    { name: "user_input_is_timeout", type: "boolean", description: "是否超时。" },
    { name: "user_input_is_cancelled", type: "boolean", description: "是否取消。" },
    { name: "user_input_message_id", type: "string", description: "用户输入消息 ID。" },
    { name: "user_input_timestamp", type: "integer", description: "用户输入时间戳（秒）。" },
  ],
  i18n: {
    name: { "zh-CN": "等待用户输入", "en-US": "Await User Input" },
    description: { "zh-CN": "提示用户输入并在收到回复后继续工作流。", "en-US": "Prompt user input and resume workflow on reply." },
    inputs: {
      prompt_template: {
        label: { "zh-CN": "提示模板", "en-US": "Prompt Template" },
        description: { "zh-CN": "提示消息（支持模板）。", "en-US": "Prompt message (supports templates)." },
      },
      prompt_display_mode: {
        label: { "zh-CN": "展示方式", "en-US": "Display Mode" },
        description: { "zh-CN": "提示展示方式。", "en-US": "Prompt display mode." },
      },
      timeout_seconds: {
        label: { "zh-CN": "超时秒数", "en-US": "Timeout (s)" },
        description: { "zh-CN": "等待超时（秒）。", "en-US": "Timeout in seconds." },
      },
      allow_empty: {
        label: { "zh-CN": "允许空输入", "en-US": "Allow Empty" },
        description: { "zh-CN": "是否允许空输入。", "en-US": "Allow empty input." },
      },
      retry_prompt_template: {
        label: { "zh-CN": "重试提示", "en-US": "Retry Prompt" },
        description: { "zh-CN": "空输入时的重新提示。", "en-US": "Prompt when input is empty." },
      },
      success_template: {
        label: { "zh-CN": "成功提示", "en-US": "Success Prompt" },
        description: { "zh-CN": "成功收到输入后的提示。", "en-US": "Prompt shown on success." },
      },
      timeout_template: {
        label: { "zh-CN": "超时提示", "en-US": "Timeout Prompt" },
        description: { "zh-CN": "超时后的提示。", "en-US": "Prompt shown on timeout." },
      },
      cancel_keywords: {
        label: { "zh-CN": "取消关键字", "en-US": "Cancel Keywords" },
        description: { "zh-CN": "取消关键字（逗号或换行分隔）。", "en-US": "Keywords to cancel (comma/newline)." },
      },
      cancel_template: {
        label: { "zh-CN": "取消提示", "en-US": "Cancel Prompt" },
        description: { "zh-CN": "取消后的提示。", "en-US": "Prompt shown on cancel." },
      },
      parse_mode: {
        label: { "zh-CN": "解析模式", "en-US": "Parse Mode" },
        description: { "zh-CN": "解析模式。", "en-US": "Parse mode." },
      },
    },
    outputs: {
      user_input: {
        label: { "zh-CN": "用户输入", "en-US": "User Input" },
        description: { "zh-CN": "用户输入文本。", "en-US": "User input text." },
      },
      user_input_status: {
        label: { "zh-CN": "输入状态", "en-US": "Input Status" },
        description: { "zh-CN": "输入状态（success/timeout/cancelled）。", "en-US": "Input status (success/timeout/cancelled)." },
      },
      user_input_is_timeout: {
        label: { "zh-CN": "是否超时", "en-US": "Is Timeout" },
        description: { "zh-CN": "是否超时。", "en-US": "Whether timeout occurred." },
      },
      user_input_is_cancelled: {
        label: { "zh-CN": "是否取消", "en-US": "Is Cancelled" },
        description: { "zh-CN": "是否取消。", "en-US": "Whether cancelled." },
      },
      user_input_message_id: {
        label: { "zh-CN": "消息 ID", "en-US": "Message ID" },
        description: { "zh-CN": "用户输入消息 ID。", "en-US": "User input message ID." },
      },
      user_input_timestamp: {
        label: { "zh-CN": "时间戳", "en-US": "Timestamp" },
        description: { "zh-CN": "用户输入时间戳（秒）。", "en-US": "User input timestamp (seconds)." },
      },
    },
  },
  ui: {
    icon: "keyboard",
    color: "#f97316",
    group: "交互",
  },
  runtime: {
    execution: "local",
    sideEffects: true,
    allowNetwork: true,
  },
  compatibility: {
    engineVersion: ">=0.1.0",
  },
};
