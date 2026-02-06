import { executeWorkflowWithResume } from "../../src/engine/executor";
import type { ButtonsModel, ResumeState, RuntimeContext, WorkflowDefinition } from "../../src/types";
import { defaultState } from "../../src/utils";

function createRuntime(variables: Record<string, unknown> = {}): RuntimeContext {
  return {
    chat_id: "1",
    user_id: "1",
    variables: { ...variables },
  };
}

function createContext(state: ButtonsModel, runtime: RuntimeContext) {
  return {
    env: {},
    state,
    button: { id: "btn_test", text: "test" },
    menu: { id: "root", name: "root", items: [] },
    runtime,
    preview: true,
  };
}

function createAwaitChildWorkflow(id: string): WorkflowDefinition {
  return {
    id,
    name: "Child",
    nodes: {
      await_1: {
        id: "await_1",
        action_id: "await_user_input",
        position: { x: 0, y: 0 },
        data: {
          prompt_template: "Input",
          prompt_display_mode: "message_text",
          timeout_seconds: 60,
          allow_empty: true,
          cancel_keywords: "",
          parse_mode: "none",
        },
      },
    },
    edges: [],
  };
}

function createParentWorkflow(id: string, childWorkflowId: string): WorkflowDefinition {
  return {
    id,
    name: "Parent",
    nodes: {
      sub_1: {
        id: "sub_1",
        action_id: "sub_workflow",
        position: { x: 0, y: 0 },
        data: {
          workflow_id: childWorkflowId,
          propagate_error: false,
        },
      },
      set_1: {
        id: "set_1",
        action_id: "set_variable",
        position: { x: 320, y: 0 },
        data: {
          variable_name: "marker",
          value: "done",
          value_type: "string",
          operation: "set",
        },
      },
    },
    edges: [
      {
        id: "e_sub_success",
        source_node: "sub_1",
        source_output: "success",
        target_node: "set_1",
        target_input: "__control__",
      },
    ],
  };
}

function createSimpleChildWorkflow(id: string): WorkflowDefinition {
  return {
    id,
    name: "ChildSimple",
    nodes: {
      set_1: {
        id: "set_1",
        action_id: "set_variable",
        position: { x: 0, y: 0 },
        data: {
          variable_name: "child_result",
          value: "ok",
          value_type: "string",
          operation: "set",
        },
      },
    },
    edges: [],
  };
}

describe("sub_workflow executor", () => {
  it("returns child pending and records parent continuation", async () => {
    const state = defaultState("Root");
    const child = createAwaitChildWorkflow("wf_child");
    const parent = createParentWorkflow("wf_parent", child.id);
    state.workflows[child.id] = child;
    state.workflows[parent.id] = parent;

    const result = await executeWorkflowWithResume(
      createContext(state, createRuntime()),
      parent
    );

    expect(result.success).toBe(true);
    expect(result.pending).toBeTruthy();
    expect(result.pending?.workflow_id).toBe("wf_child");
    expect(result.pending?.node_id).toBe("await_1");
    expect(Array.isArray(result.pending?.continuations)).toBe(true);
    expect(result.pending?.continuations?.length).toBe(1);
    expect(result.pending?.continuations?.[0]?.workflow_id).toBe("wf_parent");
    expect(result.pending?.continuations?.[0]?.node_id).toBe("sub_1");
    expect(result.pending?.continuations?.[0]?.next_index).toBe(0);
  });

  it("can resume child pending and continue parent workflow via injected sub_workflow result", async () => {
    const state = defaultState("Root");
    const child = createAwaitChildWorkflow("wf_child");
    const parent = createParentWorkflow("wf_parent", child.id);
    state.workflows[child.id] = child;
    state.workflows[parent.id] = parent;

    const firstResult = await executeWorkflowWithResume(
      createContext(state, createRuntime()),
      parent
    );
    expect(firstResult.pending).toBeTruthy();

    const pending = firstResult.pending!;
    const childOutput = {
      user_input: "hello",
      user_input_status: "success",
      user_input_is_timeout: false,
      user_input_is_cancelled: false,
      user_input_message_id: 1,
      user_input_timestamp: 1,
    };
    const childVariables = {
      ...(pending.global_variables || {}),
      ...childOutput,
    };
    const childResume: ResumeState = {
      exec_order: [...pending.exec_order],
      next_index: pending.next_index,
      node_outputs: {
        ...(pending.node_outputs || {}),
        [pending.node_id]: childOutput,
      },
      global_variables: childVariables,
      final_text_parts: [...(pending.final_text_parts || [])],
      temp_files_to_clean: [...(pending.temp_files_to_clean || [])],
    };

    const childRuntime: RuntimeContext = {
      ...pending.runtime,
      variables: childVariables,
    };
    const childResult = await executeWorkflowWithResume(
      createContext(state, childRuntime),
      child,
      childResume
    );
    expect(childResult.success).toBe(true);
    expect(childResult.pending).toBeFalsy();

    const continuation = pending.continuations?.[0];
    expect(continuation).toBeTruthy();
    const parentVariables = {
      ...(continuation!.global_variables || {}),
      __subworkflow_resume__: {
        [continuation!.node_id]: {
          __flow__: "success",
          subworkflow_success: true,
          subworkflow_error: "",
          subworkflow_text: String(childResult.new_text || ""),
          subworkflow_next_menu_id: String(childResult.next_menu_id || ""),
          subworkflow_variables:
            (childResult.data?.variables as Record<string, unknown>) || {},
          subworkflow_terminal_outputs: {
            await_1: {
              user_input: "hello",
            },
          },
          terminal_await_1__user_input: "hello",
        },
      },
    };
    const parentResume: ResumeState = {
      exec_order: [...(continuation!.exec_order || [])],
      next_index: continuation!.next_index,
      node_outputs: {
        ...(continuation!.node_outputs || {}),
      },
      global_variables: parentVariables,
      final_text_parts: [...(continuation!.final_text_parts || [])],
      temp_files_to_clean: [...(continuation!.temp_files_to_clean || [])],
    };
    const parentRuntime: RuntimeContext = {
      ...continuation!.runtime,
      variables: parentVariables,
    };
    const parentResult = await executeWorkflowWithResume(
      createContext(state, parentRuntime),
      parent,
      parentResume
    );

    expect(parentResult.success).toBe(true);
    expect(parentResult.pending).toBeFalsy();
    const finalVariables = (parentResult.data?.variables as Record<string, unknown>) || {};
    expect(finalVariables.marker).toBe("done");
    expect(finalVariables["terminal_await_1__user_input"]).toBe("hello");
    const groupedOutputs = finalVariables.subworkflow_terminal_outputs as Record<string, Record<string, unknown>>;
    expect(groupedOutputs?.await_1?.user_input).toBe("hello");
  });

  it("exposes terminal node outputs as dynamic sub workflow variables", async () => {
    const state = defaultState("Root");
    const child = createSimpleChildWorkflow("wf_child_simple");
    const parent: WorkflowDefinition = {
      id: "wf_parent_simple",
      name: "ParentSimple",
      nodes: {
        sub_1: {
          id: "sub_1",
          action_id: "sub_workflow",
          position: { x: 0, y: 0 },
          data: {
            workflow_id: child.id,
            propagate_error: false,
          },
        },
      },
      edges: [],
    };
    state.workflows[child.id] = child;
    state.workflows[parent.id] = parent;

    const result = await executeWorkflowWithResume(
      createContext(state, createRuntime()),
      parent
    );

    expect(result.success).toBe(true);
    const variables = (result.data?.variables as Record<string, unknown>) || {};
    expect(variables["terminal_set_1__variable_name"]).toBe("child_result");
    expect(variables["terminal_set_1__value"]).toBe("ok");
    const groupedOutputs = variables.subworkflow_terminal_outputs as Record<string, Record<string, unknown>>;
    expect(groupedOutputs?.set_1?.variable_name).toBe("child_result");
    expect(groupedOutputs?.set_1?.value).toBe("ok");
  });

  it("blocks recursive workflow calls", async () => {
    const state = defaultState("Root");
    const recursive: WorkflowDefinition = {
      id: "wf_recursive",
      name: "Recursive",
      nodes: {
        self_1: {
          id: "self_1",
          action_id: "sub_workflow",
          position: { x: 0, y: 0 },
          data: {
            workflow_id: "wf_recursive",
            propagate_error: true,
          },
        },
      },
      edges: [],
    };
    state.workflows[recursive.id] = recursive;

    const result = await executeWorkflowWithResume(
      createContext(state, createRuntime()),
      recursive
    );

    expect(result.success).toBe(false);
    expect(String(result.error || "")).toContain("recursive workflow call");
  });
});
