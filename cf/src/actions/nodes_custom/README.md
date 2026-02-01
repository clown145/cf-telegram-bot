# Custom Nodes

Place your custom nodes under `nodes_custom/` to keep them safe from upstream updates.

## Quick Start

1) Create a new folder, e.g. `nodes_custom/my_node/`
2) Add `definition.ts`, `handler.ts`, `index.ts`
3) Register the node package in `nodes_custom/index.ts`

## Example Layout

```
nodes_custom/
  my_node/
    definition.ts
    handler.ts
    index.ts
```

## Registration

Open `nodes_custom/index.ts` and add your package to `CUSTOM_NODE_PACKAGES`:

```ts
import myNode from "./my_node";

export const CUSTOM_NODE_PACKAGES: NodePackage[] = [
  myNode,
];
```

## Template

See `_template/` for a minimal starting point.
