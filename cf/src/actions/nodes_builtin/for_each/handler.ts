import type { ActionHandler } from "../../handlers";

const MAX_ITEMS = 5000;

function normalizeItems(raw: unknown): unknown[] {
  if (Array.isArray(raw)) {
    return raw;
  }
  if (raw === null || raw === undefined) {
    return [];
  }
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) {
      return [];
    }
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
      // fallthrough to split
    }
    return trimmed.split(",").map((entry) => entry.trim()).filter(Boolean);
  }
  return [raw];
}

export const handler: ActionHandler = async (params, context) => {
  const nodeKey = String(params.loop_key || params.__node_id || "for_each");
  const reset = Boolean(params.reset);
  const rawItems = params.items ?? params.list ?? params.array;
  const items = normalizeItems(rawItems).slice(0, MAX_ITEMS);

  const vars = context.runtime.variables || {};
  const stateKey = `_for_each_${nodeKey}`;
  let state = vars[stateKey] as { items: unknown[]; index: number } | undefined;

  const shouldReset =
    reset ||
    !state ||
    !Array.isArray(state.items) ||
    state.items.length !== items.length;

  if (shouldReset) {
    state = { items, index: 0 };
  }

  const total = state.items.length;
  if (state.index < total) {
    const index = state.index;
    const item = state.items[index];
    state.index += 1;
    const remaining = total - state.index;
    return {
      __flow__: "loop",
      item,
      index,
      index1: index + 1,
      remaining,
      total,
      loop_key: nodeKey,
      loop_state_key: stateKey,
      [stateKey]: state,
    };
  }

  return {
    __flow__: "done",
    index: total,
    index1: total,
    remaining: 0,
    total,
    loop_key: nodeKey,
    loop_state_key: stateKey,
    [stateKey]: state,
  };
};
