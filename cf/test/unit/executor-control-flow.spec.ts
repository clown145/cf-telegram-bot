import { describe, expect, it } from "vitest";
import { analyzeWorkflowExecutionPlan, executeActionPreview, buildRuntimeContext } from "../../src/engine/executor";
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

  it("blocks impossible references when source node is after target in execution order", async () => {
    const state = createBaseWorkflowState();
    state.workflows["wf_control"].nodes = {
      "1": {
        id: "1",
        action_id: "set_variable",
        position: { x: 0, y: 0 },
        data: {
          variable_name: "x",
          value: "{{ nodes.2.value }}",
          value_type: "string",
          operation: "set",
        },
      },
      "2": {
        id: "2",
        action_id: "provide_static_string",
        position: { x: 0, y: 0 },
        data: { value: "late" },
      },
    };
    state.workflows["wf_control"].edges = [
      {
        id: "e-1-2-control",
        source_node: "1",
        source_output: "__control__",
        target_node: "2",
        target_input: "__control__",
      },
      {
        id: "e-2-1-data",
        source_node: "2",
        source_output: "value",
        target_node: "1",
        target_input: "value",
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
    expect(String(result.error || "")).toContain("后序节点");
  });

  it("reports possible-empty dependency and parallel candidates for branch topology", () => {
    const state = createBaseWorkflowState();
    state.workflows["wf_control"].nodes = {
      "1": {
        id: "1",
        action_id: "set_variable",
        position: { x: 0, y: 0 },
        data: { variable_name: "flag", value: "1", operation: "set", value_type: "string" },
      },
      "2": {
        id: "2",
        action_id: "provide_static_string",
        position: { x: 0, y: 0 },
        data: { value: "left" },
      },
      "3": {
        id: "3",
        action_id: "provide_static_string",
        position: { x: 0, y: 0 },
        data: { value: "right" },
      },
      "4": {
        id: "4",
        action_id: "set_variable",
        position: { x: 0, y: 0 },
        data: {
          variable_name: "picked",
          value: "{{ nodes.2.value }}",
          operation: "set",
          value_type: "string",
        },
      },
    };
    state.workflows["wf_control"].edges = [
      {
        id: "e-1-2-true",
        source_node: "1",
        source_output: "true",
        target_node: "2",
        target_input: "__control__",
      },
      {
        id: "e-1-3-false",
        source_node: "1",
        source_output: "false",
        target_node: "3",
        target_input: "__control__",
      },
      {
        id: "e-2-4",
        source_node: "2",
        source_output: "__control__",
        target_node: "4",
        target_input: "__control__",
      },
      {
        id: "e-3-4",
        source_node: "3",
        source_output: "__control__",
        target_node: "4",
        target_input: "__control__",
      },
    ];

    const report = analyzeWorkflowExecutionPlan(state.workflows["wf_control"]);
    expect(report.issues.some((issue) => issue.code === "SOURCE_NOT_GUARANTEED")).toBe(true);
    expect(report.parallel_stages.some((stage) => stage.nodes.includes("2") && stage.nodes.includes("3"))).toBe(true);
  });

  it("can enforce warnings as blocking errors with strict_workflow_refs", async () => {
    const state = createBaseWorkflowState();
    state.workflows["wf_control"].nodes = {
      "1": {
        id: "1",
        action_id: "set_variable",
        position: { x: 0, y: 0 },
        data: { variable_name: "flag", value: "1", operation: "set", value_type: "string" },
      },
      "2": {
        id: "2",
        action_id: "provide_static_string",
        position: { x: 0, y: 0 },
        data: { value: "left" },
      },
      "3": {
        id: "3",
        action_id: "provide_static_string",
        position: { x: 0, y: 0 },
        data: { value: "right" },
      },
      "4": {
        id: "4",
        action_id: "set_variable",
        position: { x: 0, y: 0 },
        data: {
          variable_name: "picked",
          value: "{{ nodes.2.value }}",
          operation: "set",
          value_type: "string",
        },
      },
    };
    state.workflows["wf_control"].edges = [
      {
        id: "e-1-2-true",
        source_node: "1",
        source_output: "true",
        target_node: "2",
        target_input: "__control__",
      },
      {
        id: "e-1-3-false",
        source_node: "1",
        source_output: "false",
        target_node: "3",
        target_input: "__control__",
      },
      {
        id: "e-2-4",
        source_node: "2",
        source_output: "__control__",
        target_node: "4",
        target_input: "__control__",
      },
      {
        id: "e-3-4",
        source_node: "3",
        source_output: "__control__",
        target_node: "4",
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
      runtime: buildRuntimeContext(
        { chat_id: "1", user_id: "1", variables: { __trigger__: { type: "button" }, strict_workflow_refs: true } },
        "root"
      ),
      preview: true,
    });

    expect(result.success).toBe(false);
    expect(String(result.error || "")).toContain("strict_workflow_refs");
  });
});
