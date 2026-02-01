import type { ActionHandler } from "../../handlers";

export const handler: ActionHandler = async (params) => ({
  notification: {
    text: params.text ?? "操作成功",
    show_alert: Boolean(params.show_alert),
  },
});
