import type { ActionHandler } from "../../handlers";

const PLACEHOLDERS = {
  chat_id_placeholder: "{{ runtime.chat_id }}",
  user_id_placeholder: "{{ runtime.user_id }}",
  message_id_placeholder: "{{ runtime.message_id }}",
  username_placeholder: "{{ runtime.username }}",
  full_name_placeholder: "{{ runtime.full_name }}",
  callback_data_placeholder: "{{ runtime.callback_data }}",
  menu_id_placeholder: "{{ runtime.variables.menu_id }}",
  menu_name_placeholder: "{{ runtime.variables.menu_name }}",
};

export const handler: ActionHandler = async () => ({ ...PLACEHOLDERS });
