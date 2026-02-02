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
  const text = meta.text ? String(meta.text) : "";
  const matchedKeyword = meta.matched_keyword ? String(meta.matched_keyword) : "";

  return {
    event: trigger,
    ...buildCommonOutputs(context),
    text,
    matched_keyword: matchedKeyword,
  };
};

