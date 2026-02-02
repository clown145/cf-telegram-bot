import type { ModularActionDefinition } from "../../modularActions";

export const definition: ModularActionDefinition = {
  id: "redirect_trigger_button",
  version: "1.0.0",
  name: "按钮重定向",
  description: "临时把当前按钮替换为另一个按钮的行为。",
  category: "navigation",
  tags: ["redirect", "button"],
  inputs: [
    {
      name: "target_button_id",
      type: "button",
      options_source: "buttons",
      required: true,
      description: "目标按钮 ID。",
    },
    {
      name: "reuse_target_text",
      type: "boolean",
      default: true,
      description: "同步目标按钮文案。",
    },
    {
      name: "custom_text",
      type: "string",
      description: "自定义文案（优先于同步）。",
    },
    {
      name: "locate_target_menu",
      type: "boolean",
      default: false,
      description: "是否将回调上下文定位到目标菜单。",
    },
  ],
  outputs: [],
  i18n: {
    name: { "zh-CN": "按钮重定向", "en-US": "Redirect Trigger Button" },
    description: { "zh-CN": "临时把当前按钮替换为另一个按钮的行为。", "en-US": "Temporarily replace current button with another button's behavior." },
    inputs: {
      target_button_id: {
        label: { "zh-CN": "目标按钮 ID", "en-US": "Target Button ID" },
        description: { "zh-CN": "目标按钮 ID。", "en-US": "Target button ID." },
      },
      reuse_target_text: {
        label: { "zh-CN": "复用文案", "en-US": "Reuse Text" },
        description: { "zh-CN": "同步目标按钮文案。", "en-US": "Reuse target button text." },
      },
      custom_text: {
        label: { "zh-CN": "自定义文案", "en-US": "Custom Text" },
        description: { "zh-CN": "自定义文案（优先于同步）。", "en-US": "Custom text (overrides reuse)." },
      },
      locate_target_menu: {
        label: { "zh-CN": "定位菜单", "en-US": "Locate Menu" },
        description: { "zh-CN": "是否将回调上下文定位到目标菜单。", "en-US": "Locate callback context to target menu." },
      },
    },
  },
  ui: {
    icon: "swap",
    color: "#f59e0b",
    group: "导航",
  },
  runtime: {
    execution: "local",
    sideEffects: true,
    allowNetwork: false,
  },
  compatibility: {
    engineVersion: ">=0.1.0",
  },
};
