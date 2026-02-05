import { handler as branchHandler } from "../../src/actions/nodes_builtin/branch/handler";
import { handler as triggerButtonHandler } from "../../src/actions/nodes_builtin/trigger_button/handler";
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
});
