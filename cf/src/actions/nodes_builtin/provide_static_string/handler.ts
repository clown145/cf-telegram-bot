import type { ActionHandler } from "../../handlers";

export const handler: ActionHandler = async (params) => ({
  output: params.value ?? "",
});
