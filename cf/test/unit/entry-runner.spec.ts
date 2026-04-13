import { describe, expect, it, vi } from "vitest";
import { defaultState } from "../../src/utils";
import {
  buildWorkflowRuntime,
  createDefaultWorkflowEntryBinding,
  runWorkflowEntry,
} from "../../src/services/execution/entry-runner";
import type { ActionExecutionResult } from "../../src/types";

describe("entry runner service", () => {
  it("builds runtime with merged variables and menu fallback", () => {
    const runtime = buildWorkflowRuntime(
      {
        chat_id: "123",
        user_id: "42",
        variables: { alpha: 1 },
      },
      {
        extraVariables: { beta: 2 },
        menuId: "secondary",
        callbackData: "/go",
      }
    );

    expect(runtime.chat_id).toBe("123");
    expect(runtime.user_id).toBe("42");
    expect(runtime.callback_data).toBe("/go");
    expect(runtime.variables).toEqual({
      alpha: 1,
      beta: 2,
      menu_id: "secondary",
    });
  });

  it("creates default workflow entry binding", () => {
    const binding = createDefaultWorkflowEntryBinding();

    expect(binding.button).toEqual({
      id: "runtime_button",
      text: "runtime",
      type: "workflow",
      payload: {},
    });
    expect(binding.menu).toEqual({
      id: "root",
      name: "root",
      items: [],
      header: "请选择功能",
    });
  });

  it("runs execute/apply hooks in order", async () => {
    const state = defaultState("Root");
    const workflow = {
      id: "wf_test",
      name: "WF Test",
      nodes: {},
      edges: [],
    };
    const binding = createDefaultWorkflowEntryBinding();
    const request = {
      state,
      workflow,
      runtime: buildWorkflowRuntime({ chat_id: "1", variables: {} }),
      button: binding.button,
      menu: binding.menu,
      preview: false,
      trigger_type: "manual",
      trigger: { type: "manual", workflow_id: "wf_test" },
    };
    const result: ActionExecutionResult = { success: true, new_text: "ok" };
    const execute = vi.fn(async () => result);
    const apply = vi.fn(async () => undefined);

    await runWorkflowEntry(request, { execute, apply });

    expect(execute).toHaveBeenCalledTimes(1);
    expect(apply).toHaveBeenCalledWith(result, request);
  });
});
