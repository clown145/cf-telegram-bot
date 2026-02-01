import type { ActionHandler } from "../../handlers";

export const handler: ActionHandler = async (params) => ({
  menu_id: params.menu_id ?? "",
  button_id: params.button_id ?? "",
  web_app_id: params.web_app_id ?? "",
  local_action_id: params.local_action_id ?? "",
  workflow_id: params.workflow_id ?? "",
});
