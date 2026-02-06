# Node Category Convention

## Goal

Use one consistent category system for all workflow nodes so the WebUI palette stays organized.

## Standard Category Keys

`definition.category` must use one of these keys:

- `trigger`
- `flow`
- `message`
- `telegram`
- `navigation`
- `data`
- `integration`
- `utility`

## Recommended Custom Node Metadata

```ts
category: "utility",
tags: ["custom", "utility"],
ui: {
  group: "utility",
}
```

## Backend Normalization Order

When loading definitions, the backend resolves category in this order:

1. `category`
2. `ui.group`
3. `tags`
4. infer from `id`
5. fallback to `utility`

Legacy aliases like `messaging`, `control`, `io`, and `input` are automatically mapped to standard keys.

## Frontend Group Order

WebUI displays palette groups in this fixed order:

1. `trigger`
2. `flow`
3. `message`
4. `telegram`
5. `navigation`
6. `data`
7. `integration`
8. `utility`
