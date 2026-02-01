import type { ActionHandler } from "../../handlers";

export const handler: ActionHandler = async (params, context) => {
  const nodeKey = String(params.loop_key || params.__node_id || "loop");
  const countRaw = params.count ?? params.times ?? params.total ?? 0;
  const total = Math.max(0, Number(countRaw || 0));
  const reset = Boolean(params.reset);

  const stateKey = `_loop_${nodeKey}`;
  const vars = context.runtime.variables || {};
  let loopState = vars[stateKey] as { total: number; remaining: number; index: number } | undefined;
  if (reset || !loopState || typeof loopState.total !== "number" || loopState.total !== total) {
    loopState = { total, remaining: total, index: 0 };
  }

  let flow: "loop" | "done" = "done";
  if (loopState.remaining > 0) {
    loopState.remaining -= 1;
    loopState.index += 1;
    flow = "loop";
  }

  return {
    __flow__: flow,
    loop_index: loopState.index,
    loop_remaining: loopState.remaining,
    loop_total: loopState.total,
    loop_key: nodeKey,
    loop_state_key: stateKey,
    [stateKey]: loopState,
  };
};
