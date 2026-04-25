import { handler as branchHandler } from "../../src/actions/nodes_builtin/branch/handler";
import { handler as triggerButtonHandler } from "../../src/actions/nodes_builtin/trigger_button/handler";
import { handler as stringOpsHandler } from "../../src/actions/nodes_builtin/string_ops/handler";
import { handler as jsonParseHandler } from "../../src/actions/nodes_builtin/json_parse/handler";
import { handler as setVariableHandler } from "../../src/actions/nodes_builtin/set_variable/handler";
import { handler as checkMemberRoleHandler } from "../../src/actions/nodes_builtin/check_member_role/handler";
import { DATA_NODE_PACKAGES } from "../../src/actions/nodes_builtin/data_nodes";
import { renderTemplate } from "../../src/engine/templates";
import type { ActionHandlerContext } from "../../src/actions/handlers";

function createContext(variables: Record<string, unknown>): ActionHandlerContext {
  return {
    env: {},
    state: {
      version: 2,
      menus: {},
      buttons: {},
      actions: {},
      web_apps: {},
      workflows: {},
    },
    runtime: {
      chat_id: "1",
      variables,
    },
    button: { id: "btn_1" },
    menu: { id: "root" },
    preview: false,
  };
}

describe("builtin node handlers", () => {
  it("branch handler returns true flow when expression passes", async () => {
    const context = createContext({ count: 3 });
    const result = await branchHandler({ expression: "variables.count > 2" }, context);

    expect(result.__flow__).toBe("true");
    expect(result.condition_passed).toBe(true);
  });

  it("branch handler returns false flow when expression fails", async () => {
    const context = createContext({ count: 1 });
    const result = await branchHandler({ expression: "variables.count > 2" }, context);

    expect(result.__flow__).toBe("false");
    expect(result.condition_passed).toBe(false);
  });

  it("trigger_button handler exposes trigger payload from runtime", async () => {
    const trigger = {
      type: "button",
      button_id: "btn_1",
      workflow_id: "wf_1",
    };
    const context = createContext({ __trigger__: trigger });

    const result = await triggerButtonHandler({}, context);
    expect(result.event).toEqual(trigger);
  });

  it("string_ops handler supports split and contains", async () => {
    const splitResult = await stringOpsHandler(
      { operation: "split", value: "a,b,c", delimiter: "," },
      createContext({})
    );
    expect(splitResult.result).toEqual(["a", "b", "c"]);
    expect(splitResult.length).toBe(3);

    const containsResult = await stringOpsHandler(
      { operation: "contains", value: "Hello World", search: "world", case_sensitive: false },
      createContext({})
    );
    expect(containsResult.result).toBe(true);
    expect(containsResult.contains).toBe(true);
  });

  it("json_parse handler returns error fields when parse fails", async () => {
    const result = await jsonParseHandler(
      { mode: "parse", value: "{bad json}", fail_on_error: false },
      createContext({})
    );
    expect(result.is_valid).toBe(false);
    expect(String(result.error || "")).not.toBe("");
  });

  it("set_variable handler updates nested variable with increment", async () => {
    const context = createContext({ profile: { score: 10 } });
    const result = await setVariableHandler(
      { variable_name: "profile.score", value: "2", value_type: "number", operation: "increment" },
      context
    );
    expect((result.profile as any).score).toBe(12);
    expect(result.variable_name).toBe("profile.score");
    expect(result.value).toBe(12);
  });

  it("check_member_role handler routes true for admin status", async () => {
    const result = await checkMemberRoleHandler(
      { status: "administrator", check: "is_admin", expected: true },
      createContext({})
    );
    expect(result.matched).toBe(true);
    expect(result.__flow__).toBe("true");
  });

  it("data nodes support math, array, and date operations", async () => {
    const handlers = Object.fromEntries(DATA_NODE_PACKAGES.map((pkg) => [pkg.definition.id, pkg.handler]));

    const math = await handlers.math({ operation: "multiply", a: 6, b: 7 }, createContext({}));
    expect(math.result).toBe(42);

    const array = await handlers.array_ops(
      { operation: "filter", items: [{ id: 1 }, { id: 2 }], path: "id", value: 2 },
      createContext({})
    );
    expect(array.items).toEqual([{ id: 2 }]);

    const date = await handlers.date_time(
      { operation: "format", date: "2026-04-25T03:04:05Z", format: "YYYY-MM-DD HH:mm:ss" },
      createContext({})
    );
    expect(date.text).toBe("2026-04-25 03:04:05");
  });

  it("template engine supports logical, math, ternary, and filters", () => {
    const rendered = renderTemplate(
      "{{ (variables.count > 2 && variables.name ? variables.name : 'none') | upper }}:{{ (variables.count + 2) * 3 }}:{{ variables.items | join('-') }}",
      { variables: { count: 3, name: "alice", items: ["a", "b"] } }
    );
    expect(rendered).toBe("ALICE:15:a-b");
  });
});
