import type { ActionHandler } from "../../handlers";

export const handler: ActionHandler = async (_params, context) => {
  const trigger = (context.runtime?.variables as any)?.__trigger__ || null;
  return {
    event: trigger,
  };
};

