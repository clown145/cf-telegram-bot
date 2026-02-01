import type { ActionHandler } from "../../handlers";
import { coerceToBool, renderTemplate } from "../../../engine/templates";

export const handler: ActionHandler = async (params, context) => {
  const rawExpr = params.expression ?? params.condition ?? params.value;
  const expr = rawExpr !== undefined ? String(rawExpr) : "";
  const templateContext = {
    action: params,
    button: context.button,
    menu: context.menu,
    runtime: context.runtime,
    variables: context.runtime.variables || {},
  };
  let evaluated: unknown = expr;
  if (expr) {
    const template = expr.includes("{{") ? expr : `{{ ${expr} }}`;
    evaluated = renderTemplate(template, templateContext);
  }
  const passed = coerceToBool(evaluated);
  return {
    __flow__: passed ? "true" : "false",
    condition_value: evaluated,
    condition_passed: passed,
  };
};
