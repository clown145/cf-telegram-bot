import type { ActionHandler } from "../../handlers";

export const handler: ActionHandler = async (params) => ({
  result: `${params.string_a ?? ""}${params.string_b ?? ""}`,
});
