import {
  ButtonsModel,
  ButtonDefinition,
  MenuDefinition,
  WebAppDefinition,
} from "../types";
import {
  CALLBACK_PREFIX_ACTION,
  CALLBACK_PREFIX_BACK,
  CALLBACK_PREFIX_COMMAND,
  CALLBACK_PREFIX_MENU,
  CALLBACK_PREFIX_WORKFLOW,
} from "./constants";

export interface InlineKeyboardButton {
  text: string;
  callback_data?: string;
  url?: string;
  web_app?: { url: string };
  switch_inline_query?: string;
  switch_inline_query_current_chat?: string;
}

export interface InlineKeyboardMarkup {
  inline_keyboard: InlineKeyboardButton[][];
}

export interface OverridesMap {
  [buttonId: string]: Record<string, unknown>;
}

export function buildMenuMarkup(
  menuId: string,
  state: ButtonsModel,
  overrides?: OverridesMap
): { markup?: InlineKeyboardMarkup; header?: string; menu?: MenuDefinition } {
  const menu = state.menus?.[menuId];
  if (!menu) {
    return { markup: undefined, header: undefined, menu: undefined };
  }
  const buttons: ButtonDefinition[] = (menu.items || [])
    .map((id) => state.buttons?.[id])
    .filter(Boolean) as ButtonDefinition[];

  const rows: InlineKeyboardButton[][] = [];
  const shouldStack = shouldStackButtons(buttons, menu, overrides || {});

  if (shouldStack) {
    for (const btn of buttons) {
      const widget = createInlineButton(btn, state, overrides?.[btn.id]);
      if (widget) {
        rows.push([widget]);
      }
    }
  } else {
    const rowMap: Record<number, Array<{ col: number; btn: InlineKeyboardButton }>> = {};
    for (const btn of buttons) {
      const override = overrides?.[btn.id];
      const widget = createInlineButton(btn, state, override);
      if (!widget) {
        continue;
      }
      const layoutOverride = override?.layout as Record<string, unknown> | undefined;
      const rowIndex = layoutOverride && layoutOverride.row !== undefined
        ? Number(layoutOverride.row)
        : Number(btn.layout?.row ?? 0);
      const colIndex = layoutOverride && layoutOverride.col !== undefined
        ? Number(layoutOverride.col)
        : Number(btn.layout?.col ?? 0);
      rowMap[rowIndex] = rowMap[rowIndex] || [];
      rowMap[rowIndex].push({ col: colIndex, btn: widget });
    }
    const sortedRows = Object.keys(rowMap)
      .map((key) => Number(key))
      .sort((a, b) => a - b);
    for (const rowIndex of sortedRows) {
      const ordered = rowMap[rowIndex]
        .sort((a, b) => a.col - b.col)
        .map((entry) => entry.btn);
      if (ordered.length) {
        rows.push(ordered);
      }
    }
  }

  if (!rows.length) {
    return { markup: undefined, header: menu.header || "", menu };
  }

  return {
    markup: { inline_keyboard: rows },
    header: menu.header || "",
    menu,
  };
}

export function resolveButtonOverrides(
  state: ButtonsModel,
  menu: MenuDefinition,
  overrides: Record<string, unknown>[],
  currentButtonId: string
): OverridesMap {
  const resolved: OverridesMap = {};
  for (const entry of overrides || []) {
    if (!entry || typeof entry !== "object") {
      continue;
    }
    const target = String((entry as Record<string, unknown>).target || "self");
    const base: Record<string, unknown> = { ...entry } as Record<string, unknown>;
    delete base.target;
    if (!Object.keys(base).length) {
      continue;
    }
    const targets = resolveOverrideTargets(state, menu, target, currentButtonId);
    for (const buttonId of targets) {
      resolved[buttonId] = { ...(resolved[buttonId] || {}), ...base };
    }
  }
  return resolved;
}

export function findMenuForButton(state: ButtonsModel, buttonId: string): MenuDefinition | undefined {
  return Object.values(state.menus || {}).find((menu) => (menu.items || []).includes(buttonId));
}

function resolveOverrideTargets(
  state: ButtonsModel,
  menu: MenuDefinition,
  target: string,
  currentButtonId: string
): string[] {
  if (!target) {
    target = "self";
  }
  const lowered = target.toLowerCase();
  if (lowered === "self") {
    return currentButtonId && state.buttons?.[currentButtonId] ? [currentButtonId] : [];
  }
  if (lowered.startsWith("id:") || lowered.startsWith("button:")) {
    const candidate = target.split(":", 2)[1];
    return candidate && state.buttons?.[candidate] ? [candidate] : [];
  }
  if (lowered.startsWith("index:")) {
    const idxRaw = target.split(":", 2)[1];
    const idx = Number(idxRaw);
    if (!Number.isNaN(idx) && idx >= 0 && idx < (menu.items || []).length) {
      const candidate = menu.items[idx];
      return candidate && state.buttons?.[candidate] ? [candidate] : [];
    }
    return [];
  }
  if (state.buttons?.[target]) {
    return [target];
  }
  return [];
}

function shouldStackButtons(
  buttons: ButtonDefinition[],
  menu: MenuDefinition,
  overrides: OverridesMap
): boolean {
  if (!buttons.length) {
    return false;
  }
  for (const btn of buttons) {
    const layout = btn.layout || { row: 0, col: 0, rowspan: 1, colspan: 1 };
    if (layout.row !== 0 || layout.col !== 0) {
      return false;
    }
    if (layout.rowspan !== 1 || layout.colspan !== 1) {
      return false;
    }
    const override = overrides?.[btn.id];
    if (override && (override as Record<string, unknown>).layout) {
      return false;
    }
  }
  return true;
}

function createInlineButton(
  button: ButtonDefinition,
  state: ButtonsModel,
  override?: Record<string, unknown>
): InlineKeyboardButton | null {
  const actualOverride = override || {};
  const text =
    String(actualOverride.text || button.text || "未命名");

  if (actualOverride.switch_inline_query || actualOverride.switch_inline_query_current_chat) {
    return {
      text,
      switch_inline_query: actualOverride.switch_inline_query as string | undefined,
      switch_inline_query_current_chat: actualOverride.switch_inline_query_current_chat as string | undefined,
    };
  }

  if (actualOverride.raw_callback_data) {
    return { text, callback_data: String(actualOverride.raw_callback_data) };
  }

  const btnType = String(actualOverride.type || button.type || "command").toLowerCase();

  if (btnType === "raw") {
    const callbackData = actualOverride.callback_data || button.payload?.callback_data;
    if (!callbackData) {
      return null;
    }
    return { text, callback_data: String(callbackData) };
  }

  if (btnType === "command") {
    if (!button.payload?.command) {
      return null;
    }
    return { text, callback_data: `${CALLBACK_PREFIX_COMMAND}${button.id}` };
  }

  if (btnType === "url") {
    const url = actualOverride.url || button.payload?.url;
    if (!url) {
      return null;
    }
    return { text, url: String(url) };
  }

  if (btnType === "submenu") {
    const target = actualOverride.menu_id || button.payload?.menu_id;
    if (!target) {
      return null;
    }
    return { text, callback_data: `${CALLBACK_PREFIX_MENU}${target}` };
  }

  if (btnType === "action") {
    if (!button.payload?.action_id) {
      return null;
    }
    return { text, callback_data: `${CALLBACK_PREFIX_ACTION}${button.id}` };
  }

  if (btnType === "workflow") {
    if (!button.payload?.workflow_id) {
      return null;
    }
    return { text, callback_data: `${CALLBACK_PREFIX_WORKFLOW}${button.id}` };
  }

  if (btnType === "inline_query") {
    const queryText = actualOverride.query || button.payload?.query || "";
    return { text, switch_inline_query_current_chat: String(queryText) };
  }

  if (btnType === "switch_inline_query") {
    const queryText = actualOverride.query || button.payload?.query || "";
    return { text, switch_inline_query: String(queryText) };
  }

  if (btnType === "web_app") {
    let url = actualOverride.web_app_url || actualOverride.url || button.payload?.url;
    const webAppId = actualOverride.web_app_id || button.payload?.web_app_id;
    if (webAppId) {
      const webApp = state.web_apps?.[String(webAppId)];
      url = resolveWebAppUrl(webApp) || url;
    }
    if (!url) {
      return null;
    }
    return { text, web_app: { url: String(url) } };
  }

  if (btnType === "back") {
    const target = actualOverride.menu_id || button.payload?.menu_id || button.payload?.target_menu;
    if (!target) {
      return null;
    }
    return { text, callback_data: `${CALLBACK_PREFIX_BACK}${target}` };
  }

  return null;
}

function resolveWebAppUrl(webApp?: WebAppDefinition): string | undefined {
  if (!webApp) {
    return undefined;
  }
  if (webApp.kind === "external") {
    return webApp.url;
  }
  return webApp.url || "";
}
