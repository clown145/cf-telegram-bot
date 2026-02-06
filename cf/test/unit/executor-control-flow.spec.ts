import { describe, expect, it } from "vitest";
import { executeActionPreview, buildRuntimeContext } from "../../src/engine/executor";
import { defaultState } from "../../src/utils";
import type { ButtonsModel } from "../../src/types";

function createBaseWorkflowState(): ButtonsModel {
  const state = defaultState("Root");
  state.workflows["wf_control"] = {
    id: "wf_control",
    name: "WF Control",
    nodes: {},
    edges: [],
  };
  return state;
}

describe("executor control-flow ordering", () => {
  it("executes control-bus workflow by control edges instead of node id order", async () => {
    const state = createBaseWorkflowState();
    state.workflows["wf_control"].nodes = {
      "1": {
        id: "1",
        action_id: "set_variable",
        position: { x: 0, y: 0 },
        data: {
          variable_name: "seq",
          value: "1",
          value_type: "string",
          operation: "append_text",
        },
      },
      "2": {
        id: "2",
        action_id: "set_variable",
        position: { x: 0, y: 0 },
        data: {
          variable_name: "seq",
          value: "2",
          value_type: "string",
          operation: "append_text",
        },
      },
      "3": {
        id: "3",
        action_id: "set_variable",
        position: { x: 0, y: 0 },
        data: {
          variable_name: "seq",
          value: "3",
          value_type: "string",
          operation: "append_text",
        },
      },
    };
    state.workflows["wf_control"].edges = [
      {
        id: "e-3-1",
        source_node: "3",
        source_output: "__control__",
        target_node: "1",
        target_input: "__control__",
      },
      {
        id: "e-1-2",
        source_node: "1",
        source_output: "__control__",
        target_node: "2",
        target_input: "__control__",
      },
    ];

    const result = await executeActionPreview({
      env: {},
      state,
      action: {
        id: "workflow__wf_control",
        kind: "workflow",
        config: { workflow_id: "wf_control" },
      },
      button: { id: "btn_x", text: "X", type: "workflow", payload: { workflow_id: "wf_control" } },
      menu: { id: "root", name: "root", header: "Root", items: ["btn_x"] },
      runtime: buildRuntimeContext({ chat_id: "1", user_id: "1", variables: { __trigger__: { type: "button" } } }, "root"),
      preview: true,
    });

    expect(result.success).toBe(true);
    const seq = String((result.data?.variables as any)?.seq || "");
    expect(seq).toBe("312");
  });

  it("fails fast on ambiguous control output fan-out", async () => {
    const state = createBaseWorkflowState();
    state.workflows["wf_control"].nodes = {
      "1": {
        id: "1",
        action_id: "trigger_button",
        position: { x: 0, y: 0 },
        data: { button_id: "btn_x", enabled: true },
      },
      "2": {
        id: "2",
        action_id: "provide_static_string",
        position: { x: 0, y: 0 },
        data: { value: "a" },
      },
      "3": {
        id: "3",
        action_id: "provide_static_string",
        position: { x: 0, y: 0 },
        data: { value: "b" },
      },
    };
    state.workflows["wf_control"].edges = [
      {
        id: "e-1-2",
        source_node: "1",
        source_output: "__control__",
        target_node: "2",
        target_input: "__control__",
      },
      {
        id: "e-1-3",
        source_node: "1",
        source_output: "__control__",
        target_node: "3",
        target_input: "__control__",
      },
    ];

    const result = await executeActionPreview({
      env: {},
      state,
      action: {
        id: "workflow__wf_control",
        kind: "workflow",
        config: { workflow_id: "wf_control" },
      },
      button: { id: "btn_x", text: "X", type: "workflow", payload: { workflow_id: "wf_control" } },
      menu: { id: "root", name: "root", header: "Root", items: ["btn_x"] },
      runtime: buildRuntimeContext({ chat_id: "1", user_id: "1", variables: { __trigger__: { type: "button" } } }, "root"),
      preview: true,
    });

    expect(result.success).toBe(false);
    expect(String(result.error || "")).toContain("同一控制输出连接到多个节点");
  });
});
