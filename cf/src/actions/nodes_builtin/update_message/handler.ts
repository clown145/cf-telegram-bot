import type { ActionHandler } from "../../handlers";
import { normalizeParseMode } from "../../nodeHelpers";

export const handler: ActionHandler = async (params) => ({
  new_text: params.text ?? "",
  parse_mode: normalizeParseMode(params.parse_mode),
});
