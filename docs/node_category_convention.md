# Node Category Convention

## Goal

Use one consistent category system for all workflow nodes so the WebUI palette stays organized.

## Category Keys

`definition.category` can use any stable lowercase key. The WebUI palette groups are generated from the node definitions returned by the backend, so new categories do not require a frontend enum change.

These built-in keys are only preferred defaults and define the initial sort order:

- `trigger`
- `flow`
- `message`
- `telegram`
- `navigation`
- `ai`
- `data`
- `integration`
- `utility`

## Recommended Custom Node Metadata

```ts
category: "my_skill_pack",
tags: ["custom", "my-skill-pack"],
ui: {
  group: "my_skill_pack",
}
```

## Backend Normalization Order

When loading definitions, the backend resolves category in this order:

1. `category`
2. `ui.group`
3. `tags`
4. infer from `id`
5. fallback to `utility`

Legacy aliases like `messaging`, `control`, `io`, `input`, and `llm` are automatically mapped to preferred keys. Unknown explicit categories are preserved.

## Frontend Group Order

WebUI displays groups dynamically. Preferred built-in keys are sorted first:

1. `trigger`
2. `flow`
3. `message`
4. `telegram`
5. `navigation`
6. `ai`
7. `data`
8. `integration`
9. `utility`

Other categories appear after the preferred keys, sorted by backend-provided `order` and then key.

## Dynamic Skill Packs

The backend also generates skill packs from the same node definitions. By default, one skill pack is created per category. Future node definitions can override pack metadata, but the default rule is enough for Agent tool loading without sending every tool schema to the model at once.
