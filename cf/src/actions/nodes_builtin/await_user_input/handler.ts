import type { ActionHandler } from "../../handlers";
import { callTelegram } from "../../telegram";
import { buildMenuMarkup, findMenuForButton, resolveButtonOverrides } from "../../../telegram/menus";
import {
  normalizeTelegramParseMode,
  parseCancelKeywords,
  parseButtonIdFromCallback,
  normalizeButtonLabel,
} from "../../nodeHelpers";

export const handler: ActionHandler = async (params, context) => {
  const prompt = String(params.prompt_template || "请输入内容：");
  const parseMode = normalizeTelegramParseMode(params.parse_mode);
  const timeoutSeconds = Math.max(Number(params.timeout_seconds || 60), 1);
  const allowEmpty = Boolean(params.allow_empty);
  const retryPrompt = params.retry_prompt_template ? String(params.retry_prompt_template) : "";
  const successTemplate = params.success_template ? String(params.success_template) : "";
  const timeoutTemplate = params.timeout_template ? String(params.timeout_template) : "";
  const cancelTemplate = params.cancel_template ? String(params.cancel_template) : "";
  const cancelKeywords = parseCancelKeywords(params.cancel_keywords);

  const displayModeRaw = String(params.prompt_display_mode || "button_label").toLowerCase();
  let displayMode: "button_label" | "menu_title" | "message_text" = "button_label";
  if (["menu_title", "menu_header", "header", "menu"].includes(displayModeRaw)) {
    displayMode = "menu_title";
  } else if (["message_text", "message", "text"].includes(displayModeRaw)) {
    displayMode = "message_text";
  }

  const runtimeVars = context.runtime.variables || {};
  let buttonId = String(runtimeVars.button_id || "");
  if (!buttonId) {
    buttonId = parseButtonIdFromCallback(String(context.runtime.callback_data || ""));
  }
  let menuId = String(runtimeVars.menu_id || "");
  let menu = menuId ? context.state.menus?.[menuId] : undefined;
  if (!menu && buttonId) {
    menu = findMenuForButton(context.state, buttonId);
    if (menu) {
      menuId = menu.id;
    }
  }

  const originalButtonText = String(runtimeVars.button_text || (buttonId && context.state.buttons?.[buttonId]?.text) || "");
  const originalMenuHeader = String(runtimeVars.menu_header_text || menu?.header || "");

  let promptMessageId: number | undefined;
  if (!context.preview && context.runtime.chat_id && context.runtime.message_id) {
    try {
      if (displayMode === "button_label" && menu && buttonId) {
        const label = normalizeButtonLabel(prompt, originalButtonText || prompt);
        const overrides = resolveButtonOverrides(
          context.state,
          menu,
          [{ target: "self", text: label }],
          buttonId
        );
        const { markup } = buildMenuMarkup(menu.id, context.state, overrides);
        if (markup) {
          await callTelegram(context.env as any, "editMessageReplyMarkup", {
            chat_id: context.runtime.chat_id,
            message_id: context.runtime.message_id,
            reply_markup: markup,
          });
        } else {
          displayMode = "message_text";
        }
      }
      if (displayMode === "menu_title" && menu) {
        const { markup } = buildMenuMarkup(menu.id, context.state);
        await callTelegram(context.env as any, "editMessageText", {
          chat_id: context.runtime.chat_id,
          message_id: context.runtime.message_id,
          text: prompt,
          parse_mode: parseMode,
          reply_markup: markup,
        });
      }
      if (displayMode === "message_text") {
        await callTelegram(context.env as any, "editMessageText", {
          chat_id: context.runtime.chat_id,
          message_id: context.runtime.message_id,
          text: prompt,
          parse_mode: parseMode,
        });
      }
    } catch {
      displayMode = "message_text";
    }
  }
  if (!context.preview && displayMode === "message_text" && (!context.runtime.message_id || !context.runtime.chat_id)) {
    const payload: Record<string, unknown> = {
      chat_id: context.runtime.chat_id,
      text: prompt,
    };
    if (parseMode) {
      payload.parse_mode = parseMode;
    }
    const result = await callTelegram(context.env as any, "sendMessage", payload);
    promptMessageId = (result.result as any)?.message_id as number | undefined;
  }

  return {
    __await__: {
      prompt,
      prompt_display_mode: displayMode,
      timeout_seconds: timeoutSeconds,
      allow_empty: allowEmpty,
      retry_prompt_template: retryPrompt,
      success_template: successTemplate,
      timeout_template: timeoutTemplate,
      cancel_keywords: cancelKeywords,
      cancel_template: cancelTemplate,
      parse_mode: params.parse_mode ? String(params.parse_mode) : "html",
      prompt_message_id: promptMessageId,
      menu_id: menuId || undefined,
      button_id: buttonId || undefined,
      original_button_text: originalButtonText || undefined,
      original_menu_header: originalMenuHeader || undefined,
    },
  };
};
