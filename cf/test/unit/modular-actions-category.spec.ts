import {
  BUILTIN_MODULAR_ACTIONS,
  normalizeNodeCategory,
} from "../../src/actions/modularActions";

describe("modular action category normalization", () => {
  it("maps legacy aliases to standard category keys", () => {
    expect(normalizeNodeCategory({ category: "messaging" })).toBe("message");
    expect(normalizeNodeCategory({ category: "control" })).toBe("flow");
    expect(normalizeNodeCategory({ category: "io" })).toBe("integration");
    expect(normalizeNodeCategory({ category: "input" })).toBe("telegram");
    expect(normalizeNodeCategory({ category: "custom" })).toBe("utility");
  });

  it("resolves fallback sources in order: group -> tags -> id", () => {
    expect(normalizeNodeCategory({ group: "menu" })).toBe("navigation");
    expect(normalizeNodeCategory({ tags: ["json"] })).toBe("data");
    expect(normalizeNodeCategory({ id: "trigger_command" })).toBe("trigger");
    expect(normalizeNodeCategory({ id: "llm_generate" })).toBe("ai");
    expect(normalizeNodeCategory({ id: "unknown_node" })).toBe("utility");
  });

  it("keeps explicit custom categories for dynamic grouping", () => {
    expect(normalizeNodeCategory({ category: "media_tools" })).toBe("media_tools");
    expect(normalizeNodeCategory({ group: "custom_pack" })).toBe("custom_pack");
  });

  it("normalizes all exported modular actions to non-empty categories", () => {
    for (const action of Object.values(BUILTIN_MODULAR_ACTIONS)) {
      expect(String(action.category || "")).not.toBe("");
    }
  });

  it("exposes run_workflow as a flow category node", () => {
    expect(BUILTIN_MODULAR_ACTIONS.run_workflow).toBeTruthy();
    expect(BUILTIN_MODULAR_ACTIONS.run_workflow.category).toBe("flow");
  });
});
