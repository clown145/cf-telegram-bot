import type { ActionHandler } from "../../handlers";
import type { ModularActionDefinition } from "../../modularActions";
import { definition } from "./definition";
import { handler } from "./handler";

const node = {
  definition: definition as ModularActionDefinition,
  handler: handler as ActionHandler,
};

export default node;
