import type { ActionHandler } from "../../handlers";

function buildCommonOutputs(context: Parameters<ActionHandler>[1]) {
  const runtime = context.runtime || ({} as any);
  return {
    chat_id: String(runtime.chat_id || ""),
    user_id: runtime.user_id ? String(runtime.user_id) : "",
    message_id: runtime.message_id ?? null,
    chat_type: runtime.chat_type ? String(runtime.chat_type) : "",
    username: runtime.username ? String(runtime.username) : "",
    full_name: runtime.full_name ? String(runtime.full_name) : "",
  };
}

export const handler: ActionHandler = async (_params, context) => {
  const trigger = (context.runtime?.variables as any)?.__trigger__ || null;
  const meta = trigger && typeof trigger === "object" ? (trigger as any) : {};
  const buttonId = meta.button_id ? String(meta.button_id) : "";
  const buttonText = meta.button_text ? String(meta.button_text) : "";
  const callbackData = meta.callback_data ? String(meta.callback_data) : "";

  return {
    event: trigger,
    ...buildCommonOutputs(context),
    button_id: buttonId,
    button_text: buttonText,
    callback_data: callbackData,
  };
};

