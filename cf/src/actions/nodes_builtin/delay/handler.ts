import type { ActionHandler } from "../../handlers";
import { sleep } from "../../nodeHelpers";

export const handler: ActionHandler = async (params) => {
  const delayMs = Number(params.delay_ms || 0);
  if (delayMs > 0) {
    await sleep(delayMs);
  }
  return {
    passthrough_output: params.passthrough_input ?? null,
  };
};
