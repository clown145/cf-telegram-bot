import type { ModularActionDefinition } from "../modularActions";
import type { ActionHandler } from "../handlers";

// Add custom node packages here to keep them isolated from upstream updates.
export interface NodePackage {
  definition: ModularActionDefinition;
  handler: ActionHandler;
}

export const CUSTOM_NODE_PACKAGES: NodePackage[] = [];

export const CUSTOM_NODE_DEFINITIONS: ModularActionDefinition[] = CUSTOM_NODE_PACKAGES.map(
  (pkg) => pkg.definition
);

export const CUSTOM_NODE_HANDLERS: Record<string, ActionHandler> = Object.fromEntries(
  CUSTOM_NODE_PACKAGES.map((pkg) => [pkg.definition.id, pkg.handler])
);
