import type { ActionHandler } from "../../handlers";

export const handler: ActionHandler = async () => ({
  __flow__: "try",
  try_armed: true,
});
