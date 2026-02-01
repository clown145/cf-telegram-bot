import type { ActionHandler } from "../../handlers";
import {
  CALLBACK_PREFIX_ACTION,
  CALLBACK_PREFIX_BACK,
  CALLBACK_PREFIX_COMMAND,
  CALLBACK_PREFIX_REDIRECT,
  CALLBACK_PREFIX_WORKFLOW,
} from "../../../telegram/constants";

export const handler: ActionHandler = async (params, context) => {
  const targetId = String(params.target_button_id || "").trim();
  if (!targetId) {
    throw new Error("target_button_id is required");
  }
  const targetButton = context.state.buttons?.[targetId];
  if (!targetButton) {
    throw new Error(`button not found: ${targetId}`);
  }

  const reuseText = params.reuse_target_text !== undefined ? Boolean(params.reuse_target_text) : true;
  const customText = params.custom_text ? String(params.custom_text) : "";
  const locateTargetMenu = Boolean(params.locate_target_menu);

  const override: Record<string, unknown> = { target: "self", temporary: true };
  if (customText) {
    override.text = customText;
  } else if (reuseText && targetButton.text) {
    override.text = targetButton.text;
  }

  const payload = (targetButton.payload || {}) as Record<string, unknown>;
  const btnType = String(targetButton.type || "command").toLowerCase();

  if (btnType === "url") {
    const url = payload.url;
    if (!url) {
      throw new Error("target url is missing");
    }
    override.type = "url";
    override.url = url;
  } else if (btnType === "web_app") {
    override.type = "web_app";
    if (payload.web_app_id) {
      override.web_app_id = payload.web_app_id;
    }
    if (payload.url) {
      override.web_app_url = payload.url;
    }
  } else if (btnType === "submenu") {
    const menuId = payload.menu_id;
    if (!menuId) {
      throw new Error("target submenu missing menu_id");
    }
    override.type = "submenu";
    override.menu_id = menuId;
  } else if (btnType === "inline_query") {
    override.type = "inline_query";
    override.query = String(payload.query || "");
  } else if (btnType === "switch_inline_query") {
    override.type = "switch_inline_query";
    override.query = String(payload.query || "");
  } else if (btnType === "raw") {
    const callbackData = payload.callback_data;
    if (!callbackData) {
      throw new Error("target raw button missing callback_data");
    }
    override.raw_callback_data = String(callbackData);
  } else if (btnType === "back") {
    const menuId = payload.menu_id || payload.target_menu;
    if (!menuId) {
      throw new Error("target back button missing menu_id");
    }
    override.raw_callback_data = `${CALLBACK_PREFIX_BACK}${menuId}`;
  } else if (btnType === "command") {
    override.raw_callback_data = `${CALLBACK_PREFIX_COMMAND}${targetButton.id}`;
  } else if (btnType === "action") {
    override.raw_callback_data = `${CALLBACK_PREFIX_ACTION}${targetButton.id}`;
  } else if (btnType === "workflow") {
    override.raw_callback_data = `${CALLBACK_PREFIX_WORKFLOW}${targetButton.id}`;
  } else {
    const callbackData = payload.callback_data;
    if (callbackData) {
      override.raw_callback_data = String(callbackData);
    } else {
      override.raw_callback_data = `${CALLBACK_PREFIX_COMMAND}${targetButton.id}`;
    }
  }

  if (override.raw_callback_data) {
    const variables = context.runtime.variables || {};
    const originButtonId = String(variables.button_id || variables.redirect_original_button_id || "");
    const originMenuId = String(variables.menu_id || variables.redirect_original_menu_id || "");
    const flag = locateTargetMenu ? "1" : "0";
    const wrappedButtonId = originButtonId || targetButton.id;
    override.raw_callback_data = `${CALLBACK_PREFIX_REDIRECT}${wrappedButtonId}:${originMenuId}:${flag}:${override.raw_callback_data}`;
  }

  return { button_overrides: [override] };
};
