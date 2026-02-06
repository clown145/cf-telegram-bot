import { computed, nextTick, reactive, ref, watch, type Ref } from "vue";
import { showInfoModal } from "../../services/uiBridge";
import { CONTROL_INPUT_NAMES, CONTROL_PORT_NAME, isControlFlowOutputName } from "./constants";
import type { DrawflowEditor } from "./useDrawflow";

interface UseWorkflowNodeModalOptions {
  store: any;
  editor: Ref<DrawflowEditor | null>;
  currentWorkflowId: Ref<string>;
  convertToCustomFormat: (dfData: any) => any;
  getActionDisplayName: (actionId: string, action: any) => string;
  getInputLabel: (action: any, input: any) => string;
  t: (key: string, args?: any) => string;
}

export function useWorkflowNodeModal(options: UseWorkflowNodeModalOptions) {
  const { store, editor, currentWorkflowId, convertToCustomFormat, getActionDisplayName, getInputLabel, t } = options;
// Node Config Modal
const nodeModal = reactive({
   visible: false,
   nodeId: '',
   // eslint-disable-next-line @typescript-eslint/no-explicit-any
   action: null as any,
   // eslint-disable-next-line @typescript-eslint/no-explicit-any
   originalData: {} as any
});
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const formValues = reactive<Record<string, any>>({});
type InputMode = "literal" | "ref" | "wire";
const inputMode = reactive<Record<string, InputMode>>({});
const nodeModalTab = ref<"params" | "links" | "advanced">("params");
const rawJson = ref('');
const useRawJson = ref(false);
const upstreamPicker = reactive({
   nodeId: '',
   output: '',
   subpath: '',
   selectedKey: ''
});
const upstreamModal = reactive({
   visible: false,
   targetInput: "",
   applyAs: "ref" as "ref" | "wire",
});

const wireBoardRef = ref<HTMLElement | null>(null);
const wireFilter = reactive({
   upstream: "",
   inputs: "",
   onlyConnected: false,
});
const wireShowWires = ref(true);
const wireFocusOnly = ref(true);
const wireFocusInput = ref<string>("");
const wirePathEditingInput = ref<string>("");
const wirePathDraft = ref<string>("");
const wireActiveSource = reactive({
   nodeId: "",
   output: "",
   source_path: "",
});
const wireLines = ref<Array<{ id: string; d: string; targetInput: string }>>([]);
const wireVisibleLines = computed(() => {
   if (!wireShowWires.value) return [];
   if (wireFocusOnly.value && wireFocusInput.value) {
      return wireLines.value.filter((l) => l.targetInput === wireFocusInput.value);
   }
   return wireLines.value;
});
const wireDrag = reactive({
   active: false,
   pointerId: 0,
   nodeId: "",
   output: "",
   source_path: "",
   startX: 0,
   startY: 0,
   x: 0,
   y: 0,
   hoverInput: "",
   tempD: "",
});
const wirePortElements = new Map<string, HTMLElement>();

const nodeInputs = computed(() => {
   const action = nodeModal.action;
   if (!action) return [];
   return action.inputs || action.parameters || [];
});

const paramsSearchTerm = ref<string>("");
const paramsActiveInputName = ref<string>("");
const selectParamInput = (inputName: string) => {
   paramsActiveInputName.value = String(inputName || "");
};

type SelectOption = { label: string; value: string };

const buildOptionsFromSource = (source: string): SelectOption[] => {
   const key = String(source || "").trim();
   if (!key) return [];

   if (key === "buttons") {
      return Object.values(store.state.buttons || {}).map((btn) => ({
         value: btn.id,
         label: `${btn.text || btn.id} (${btn.id})`,
      }));
   }

   if (key === "menus") {
      return Object.values(store.state.menus || {}).map((menu) => ({
         value: menu.id,
         label: `${menu.name || menu.id} (${menu.id})`,
      }));
   }

   if (key === "web_apps") {
      return Object.values(store.state.web_apps || {}).map((app) => ({
         value: app.id,
         label: `${app.name || app.id} (${app.id})`,
      }));
   }

   if (key === "local_actions") {
      return (store.localActions || []).map((a) => ({
         value: a.name,
         label: a.name,
      }));
   }

   if (key === "workflows") {
      return Object.values(store.state.workflows || {}).map((wf) => ({
         value: wf.id,
         label: `${wf.name || wf.id} (${wf.id})`,
      }));
   }

   return [];
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getInputSelectOptions = (input: any): SelectOption[] => {
   if (!input) return [];

   if (Array.isArray(input.options) && input.options.length) {
      return input.options
         .map((opt: any) => ({ value: String(opt.value), label: String(opt.label || opt.value) }))
         .filter((opt: SelectOption) => opt.value);
   }

   if (Array.isArray(input.enum) && input.enum.length) {
      const labels = (input.enum_labels && typeof input.enum_labels === "object") ? input.enum_labels : {};
      return input.enum
         .map((value: any) => {
            const v = String(value);
            return { value: v, label: String((labels as any)[v] || v) };
         })
         .filter((opt: SelectOption) => opt.value);
   }

   if (input.options_source) {
      return buildOptionsFromSource(String(input.options_source));
   }

   return [];
};

const getStoredWorkflowCustom = () => {
   if (!currentWorkflowId.value) return null;
   // store typings may not include legacy `.data` wrapper
   const wf: any = (store.state.workflows as any)?.[currentWorkflowId.value];
   if (!wf) return null;
   if (wf.nodes && wf.edges) return wf;
   if (wf.data && typeof wf.data === "object" && (wf.data as any).nodes) return wf.data;
   if (typeof wf.data === "string") {
      try {
         const parsed = JSON.parse(wf.data);
         if (parsed && parsed.nodes) return parsed;
      } catch {
         return null;
      }
   }
   return null;
};

const currentWorkflowSnapshot = computed(() => {
   const stored = getStoredWorkflowCustom();
   const storedEdges = Array.isArray(stored?.edges) ? (stored?.edges as any[]) : [];
   const hiddenEdges = storedEdges.filter((e) => {
      if (!e) return false;
      if (String(e.target_input || "") === CONTROL_PORT_NAME) return false;
      if (isControlFlowOutputName(String(e.source_output || ""))) return false;
      return true;
   });

   if (!editor.value) {
      return stored || { nodes: {}, edges: hiddenEdges };
   }

   try {
      const exported = editor.value.export();
      const custom = convertToCustomFormat(exported);
      custom.edges = [...(custom.edges || []), ...hiddenEdges];
      return custom;
   } catch {
      return stored || { nodes: {}, edges: hiddenEdges };
   }
});

const upstreamNodes = computed(() => {
   if (!currentWorkflowId.value) return [];
   const workflow = currentWorkflowSnapshot.value as any;
   if (!workflow || !workflow.nodes || !nodeModal.nodeId) return [];

   const reverse: Record<string, string[]> = {};
   (workflow.edges || []).forEach((edge: any) => {
      if (!edge || edge.target_node !== nodeModal.nodeId) return;
      if (!CONTROL_INPUT_NAMES.has(String(edge.target_input || ""))) return;
      const src = String(edge.source_node || "");
      if (!src) return;
      reverse[nodeModal.nodeId] = reverse[nodeModal.nodeId] || [];
      reverse[nodeModal.nodeId].push(src);
   });

   // Build full ancestor set (control edges only)
   const reverseAll: Record<string, string[]> = {};
   (workflow.edges || []).forEach((edge: any) => {
      if (!edge) return;
      if (!CONTROL_INPUT_NAMES.has(String(edge.target_input || ""))) return;
      const dst = String(edge.target_node || "");
      const src = String(edge.source_node || "");
      if (!dst || !src) return;
      reverseAll[dst] = reverseAll[dst] || [];
      reverseAll[dst].push(src);
   });

   const seen = new Set<string>();
   const queue: string[] = (reverseAll[nodeModal.nodeId] || []).slice();
   while (queue.length) {
      const id = queue.shift() as string;
      if (!id || seen.has(id)) continue;
      seen.add(id);
      (reverseAll[id] || []).forEach((p) => {
         if (!seen.has(p)) queue.push(p);
      });
   }

   const palette = (store as any).buildActionPalette ? (store as any).buildActionPalette() : {};
   const result = Array.from(seen).map((id) => {
      const node = workflow.nodes?.[id];
      const actionId = node?.action_id || '';
      const action = palette[actionId];
      const name = getActionDisplayName(actionId, action) || actionId || id;
      return { id, label: `${name} (${id})`, actionId, action };
   });

   result.sort((a, b) => a.label.localeCompare(b.label));
   return result;
});

const upstreamNodeOptions = computed(() => upstreamNodes.value.map((n) => ({ label: n.label, value: n.id })));

const dataLinkInputOptions = computed(() => {
   const action = nodeModal.action;
   const inputs = nodeInputs.value as any[];
   return inputs
      .map((input) => {
         const base = getInputLabel(action, input) || input.name;
         return { label: `${base} (${input.name})`, value: input.name };
      })
      .filter((opt) => opt.value && String(opt.value) !== CONTROL_PORT_NAME);
});

const hiddenDataEdges = computed(() => {
   if (!currentWorkflowId.value || !nodeModal.nodeId) return [];
   const workflow = getStoredWorkflowCustom();
   const edges = (workflow?.edges || []) as any[];
   return edges.filter((e) => {
      if (!e) return false;
      if (e.target_node !== nodeModal.nodeId) return false;
      if (String(e.target_input || "") === CONTROL_PORT_NAME) return false;
      if (isControlFlowOutputName(String(e.source_output || ""))) return false;
      return true;
   });
});

const getNodeLabel = (nodeId: string) => {
   if (!currentWorkflowId.value) return nodeId;
   const workflow = currentWorkflowSnapshot.value as any;
   const node = workflow?.nodes?.[nodeId];
   if (!node) return nodeId;
   const palette = (store as any).buildActionPalette ? (store as any).buildActionPalette() : {};
   const actionId = node?.action_id || "";
   const action = palette[actionId];
   const name = getActionDisplayName(actionId, action) || actionId || nodeId;
   return `${name} (${nodeId})`;
};

const hiddenEdgeByInput = computed(() => {
   const map = new Map<string, any>();
   for (const edge of hiddenDataEdges.value as any[]) {
      const key = String(edge?.target_input || "").trim();
      if (!key) continue;
      map.set(key, edge);
   }
   return map;
});

const getHiddenEdgeByInput = (inputName: string) => {
   const key = String(inputName || "").trim();
   if (!key) return null;
   return hiddenEdgeByInput.value.get(key) || null;
};

const wireableNodeInputs = computed(() => {
   const inputs = (nodeInputs.value || []) as any[];
   return inputs.filter((input) => {
      const name = String(input?.name || "").trim();
      if (!name) return false;
      if (CONTROL_INPUT_NAMES.has(name)) return false;
      return true;
   });
});

const filteredParamInputs = computed(() => {
   const term = String(paramsSearchTerm.value || "").trim().toLowerCase();
   if (!term) return wireableNodeInputs.value;
   return wireableNodeInputs.value.filter((input) => {
      const name = String(input?.name || "").trim();
      if (!name) return false;
      const label = String(getInputLabel(nodeModal.action, input) || "").toLowerCase();
      return label.includes(term) || name.toLowerCase().includes(term);
   });
});

const activeParamInput = computed(() => {
   const active = String(paramsActiveInputName.value || "").trim();
   const list = filteredParamInputs.value;
   if (!list.length) return null;
   if (active) {
      const found = list.find((input) => String(input?.name || "") === active);
      if (found) return found;
   }
   return list[0] || null;
});

watch(
   () => [nodeModal.visible, paramsSearchTerm.value, filteredParamInputs.value.length],
   () => {
      if (!nodeModal.visible) return;
      if (nodeModalTab.value !== "params") return;
      const list = filteredParamInputs.value;
      if (!list.length) {
         paramsActiveInputName.value = "";
         return;
      }
      const active = String(paramsActiveInputName.value || "").trim();
      const exists = active && list.some((input) => String(input?.name || "") === active);
      if (!exists) {
         paramsActiveInputName.value = String(list[0]?.name || "");
      }
   },
   { immediate: true }
);

const filteredWireInputs = computed(() => {
   const term = String(wireFilter.inputs || "").trim().toLowerCase();
   return wireableNodeInputs.value.filter((input) => {
      const name = String(input?.name || "").trim();
      if (!name) return false;
      if (wireFilter.onlyConnected && !getHiddenEdgeByInput(name)) return false;
      if (!term) return true;
      const label = String(getInputLabel(nodeModal.action, input) || "").toLowerCase();
      return label.includes(term) || name.toLowerCase().includes(term);
   });
});

const filteredWireInputRows = computed(() => {
   return filteredWireInputs.value.map((input: any) => ({
      input,
      edge: getHiddenEdgeByInput(String(input?.name || "")),
   }));
});

const makeWireSrcKey = (nodeId: string, output: string) => `src:${nodeId}:${output}`;
const makeWireInKey = (inputName: string) => `in:${inputName}`;

const registerWirePortEl = (key: string, el: HTMLElement | null) => {
   if (el) {
      wirePortElements.set(key, el);
   } else {
      wirePortElements.delete(key);
   }
};

const buildCurveD = (sx: number, sy: number, tx: number, ty: number) => {
   const cp = Math.max(60, Math.min(160, Math.abs(tx - sx) / 2));
   return `M ${sx} ${sy} C ${sx + cp} ${sy} ${tx - cp} ${ty} ${tx} ${ty}`;
};

const recalcWireOverlay = () => {
   const container = wireBoardRef.value;
   if (!container) {
      wireLines.value = [];
      return;
   }
   const cRect = container.getBoundingClientRect();
   const lines: Array<{ id: string; d: string; targetInput: string }> = [];
   for (const edge of hiddenDataEdges.value as any[]) {
      const srcKey = makeWireSrcKey(String(edge?.source_node || ""), String(edge?.source_output || ""));
      const inKey = makeWireInKey(String(edge?.target_input || ""));
      const srcEl = wirePortElements.get(srcKey);
      const inEl = wirePortElements.get(inKey);
      if (!srcEl || !inEl) continue;
      const s = srcEl.getBoundingClientRect();
      const t = inEl.getBoundingClientRect();
      const sx = s.left + s.width / 2 - cRect.left;
      const sy = s.top + s.height / 2 - cRect.top;
      const tx = t.left + t.width / 2 - cRect.left;
      const ty = t.top + t.height / 2 - cRect.top;
      const d = buildCurveD(sx, sy, tx, ty);
      const id = String(edge?.id || `${srcKey}->${inKey}`);
      lines.push({ id, d, targetInput: String(edge?.target_input || "") });
   }
   wireLines.value = lines;
};

let wireOverlayRaf = 0;
const scheduleWireOverlayRecalc = () => {
   if (wireOverlayRaf) return;
   wireOverlayRaf = window.requestAnimationFrame(() => {
      wireOverlayRaf = 0;
      recalcWireOverlay();
   });
};

const handleWireResize = () => {
   if (wireDrag.active) {
      stopWireDrag();
   }
   scheduleWireOverlayRecalc();
};

const updateWireDragTemp = () => {
   if (!wireDrag.active) {
      wireDrag.tempD = "";
      return;
   }
   wireDrag.tempD = buildCurveD(wireDrag.startX, wireDrag.startY, wireDrag.x, wireDrag.y);
};

const updateWireHover = (clientX: number, clientY: number) => {
   const el = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
   const port = el?.closest?.("[data-wire-port]") as HTMLElement | null;
   if (port && port.dataset.wirePort === "in") {
      wireDrag.hoverInput = port.dataset.wireTargetInput || "";
   } else {
      wireDrag.hoverInput = "";
   }
};

const stopWireDrag = () => {
   if (!wireDrag.active) return;
   wireDrag.active = false;
   wireDrag.pointerId = 0;
   wireDrag.nodeId = "";
   wireDrag.output = "";
   wireDrag.source_path = "";
   wireDrag.hoverInput = "";
   wireDrag.tempD = "";
   window.removeEventListener("pointermove", onWirePointerMove, true);
   window.removeEventListener("pointerup", onWirePointerUp, true);
   window.removeEventListener("pointercancel", onWirePointerUp, true);
};

const onWirePointerMove = (e: PointerEvent) => {
   if (!wireDrag.active || e.pointerId !== wireDrag.pointerId) return;
   const container = wireBoardRef.value;
   if (!container) return;
   const rect = container.getBoundingClientRect();
   wireDrag.x = e.clientX - rect.left;
   wireDrag.y = e.clientY - rect.top;
   updateWireHover(e.clientX, e.clientY);
   updateWireDragTemp();
};

const onWirePointerUp = (e: PointerEvent) => {
   if (!wireDrag.active || e.pointerId !== wireDrag.pointerId) return;
   const targetInput = wireDrag.hoverInput;
   const nodeId = wireDrag.nodeId;
   const output = wireDrag.output;
   const sourcePath = wireDrag.source_path;
   stopWireDrag();

   if (targetInput && nodeId && output) {
      inputMode[targetInput] = "wire";
      addHiddenDataEdgeForInput(targetInput, nodeId, output, sourcePath);
      wireFocusInput.value = targetInput;
      nextTick(scheduleWireOverlayRecalc);
   }
};

const startWireDrag = (nodeId: string, output: string, e: PointerEvent) => {
   const container = wireBoardRef.value;
   if (!container) return;

   // keep selection in sync with the path field
   selectWireSource(nodeId, output);

   wireDrag.active = true;
   wireDrag.pointerId = e.pointerId;
   wireDrag.nodeId = nodeId;
   wireDrag.output = output;
   wireDrag.source_path = String(wireActiveSource.source_path || "");

   const rect = container.getBoundingClientRect();
   const srcEl = wirePortElements.get(makeWireSrcKey(nodeId, output));
   if (srcEl) {
      const s = srcEl.getBoundingClientRect();
      wireDrag.startX = s.left + s.width / 2 - rect.left;
      wireDrag.startY = s.top + s.height / 2 - rect.top;
   } else {
      wireDrag.startX = e.clientX - rect.left;
      wireDrag.startY = e.clientY - rect.top;
   }
   wireDrag.x = e.clientX - rect.left;
   wireDrag.y = e.clientY - rect.top;
   updateWireHover(e.clientX, e.clientY);
   updateWireDragTemp();

   window.addEventListener("pointermove", onWirePointerMove, true);
   window.addEventListener("pointerup", onWirePointerUp, true);
   window.addEventListener("pointercancel", onWirePointerUp, true);
};

watch(
   () => [nodeModal.visible, nodeModalTab.value, hiddenDataEdges.value.length, upstreamNodes.value.length],
   () => {
      if (!nodeModal.visible) return;
      if (nodeModalTab.value === "links" && !wireFocusInput.value) {
         // Prefer showing an existing connection if possible.
         const connected = filteredWireInputs.value.find((input: any) =>
            getHiddenEdgeByInput(String(input?.name || ""))
         );
         const first = connected || filteredWireInputs.value[0];
         if (first?.name) {
            wireFocusInput.value = String(first.name);
         }
      }
      nextTick(scheduleWireOverlayRecalc);
   }
);

watch(
   () => [wireFilter.upstream, wireFilter.inputs, wireFilter.onlyConnected],
   () => nextTick(scheduleWireOverlayRecalc)
);

watch(
   () => wireShowWires.value,
   (next) => {
      if (next) {
         nextTick(scheduleWireOverlayRecalc);
      }
   }
);

watch(
   () => [wireFocusInput.value, wirePathEditingInput.value],
   () => {
      if (!nodeModal.visible) return;
      if (nodeModalTab.value !== "links") return;
      nextTick(scheduleWireOverlayRecalc);
   }
);

function getUpstreamDataOutputs(n: any): string[] {
   const outputs = (n?.action?.outputs || []) as any[];
   const dataOutputs = outputs
      .filter((o) => o && String(o.type || "").toLowerCase() !== "flow")
      .map((o) => String(o.name || "").trim())
      .filter(Boolean);
   return dataOutputs;
}

const upstreamWireNodes = computed(() => upstreamNodes.value.filter((n) => getUpstreamDataOutputs(n).length > 0));

const wireUpstreamTerm = computed(() => String(wireFilter.upstream || "").trim().toLowerCase());

const filteredUpstreamWireNodes = computed(() => {
   const term = wireUpstreamTerm.value;
   if (!term) return upstreamWireNodes.value;
   return upstreamWireNodes.value.filter((n) => {
      const label = String(n?.label || "").toLowerCase();
      if (label.includes(term)) return true;
      return getUpstreamDataOutputs(n).some((out) => out.toLowerCase().includes(term));
   });
});

const getFilteredUpstreamDataOutputs = (n: any): string[] => {
   const outputs = getUpstreamDataOutputs(n);
   const term = wireUpstreamTerm.value;
   if (!term) return outputs;
   const label = String(n?.label || "").toLowerCase();
   if (label.includes(term)) return outputs;
   return outputs.filter((out) => out.toLowerCase().includes(term));
};

const selectWireSource = (nodeId: string, output: string) => {
   const changed = wireActiveSource.nodeId !== nodeId || wireActiveSource.output !== output;
   wireActiveSource.nodeId = nodeId;
   wireActiveSource.output = output;
   if (changed) {
      wireActiveSource.source_path = "";
   }
   if (wireDrag.active) {
      wireDrag.source_path = String(wireActiveSource.source_path || "");
      updateWireDragTemp();
   }
};

const clearWireSource = () => {
   wireActiveSource.nodeId = "";
   wireActiveSource.output = "";
   wireActiveSource.source_path = "";
   if (wireDrag.active) {
      stopWireDrag();
   }
};

const setWireFocus = (inputName: string) => {
   wireFocusInput.value = inputName;
};

const connectWireToInput = (inputName: string) => {
   const targetInput = String(inputName || "").trim();
   if (!targetInput) return;
   if (!wireActiveSource.nodeId || !wireActiveSource.output) return;
   inputMode[targetInput] = "wire";
   addHiddenDataEdgeForInput(targetInput, wireActiveSource.nodeId, wireActiveSource.output, wireActiveSource.source_path);
   wireFocusInput.value = targetInput;
   nextTick(scheduleWireOverlayRecalc);
};

const beginWirePathEdit = (inputName: string) => {
   const edge = getHiddenEdgeByInput(inputName);
   if (!edge) return;
   wirePathEditingInput.value = inputName;
   wirePathDraft.value = String(edge?.source_path || "");
};

const saveWirePathEdit = (inputName: string) => {
   if (wirePathEditingInput.value !== inputName) return;
   const edge = getHiddenEdgeByInput(inputName);
   if (!edge) {
      wirePathEditingInput.value = "";
      return;
   }
   const v = String(wirePathDraft.value || "").trim();
   edge.source_path = v ? v : undefined;
   wirePathEditingInput.value = "";
   nextTick(scheduleWireOverlayRecalc);
};

const goToWiringBoard = (inputName: string) => {
   wireFilter.upstream = "";
   wireFilter.inputs = "";
   wireFilter.onlyConnected = false;
   wireShowWires.value = true;
   nodeModalTab.value = "links";
   wireFocusInput.value = inputName;
   nextTick(() => {
      const el = wirePortElements.get(makeWireInKey(inputName));
      el?.scrollIntoView?.({ block: "center" } as any);
      scheduleWireOverlayRecalc();
   });
};

const removeHiddenDataEdge = (edge: any) => {
   const wf = getStoredWorkflowCustom();
   if (!wf?.edges) return;
   wf.edges = (wf.edges as any[]).filter((e) => e !== edge && e?.id !== edge?.id);
};

const removeHiddenDataEdgeByInput = (inputName: string) => {
   const edge = getHiddenEdgeByInput(inputName);
   if (!edge) return;
   removeHiddenDataEdge(edge);
};

const convertHiddenDataEdgeToRef = (edge: any) => {
   const targetInput = String(edge?.target_input || "");
   const sourceNode = String(edge?.source_node || "");
   const sourceOutput = String(edge?.source_output || "");
   const sourcePath = String(edge?.source_path || "");
   if (!targetInput || !sourceNode || !sourceOutput) return;
   if (targetInput in formValues) {
      inputMode[targetInput] = "ref";
      formValues[targetInput] = buildUpstreamExpr(sourceNode, sourceOutput, sourcePath);
   }
   removeHiddenDataEdge(edge);
};

const convertHiddenDataEdgeToRefByInput = (inputName: string) => {
   const edge = getHiddenEdgeByInput(inputName);
   if (!edge) return;
   convertHiddenDataEdgeToRef(edge);
};

const addHiddenDataEdgeForInput = (targetInput: string, sourceNode: string, sourceOutput: string, sourcePath?: string) => {
   const wf = getStoredWorkflowCustom();
   if (!wf || !nodeModal.nodeId) return;
   wf.edges = Array.isArray(wf.edges) ? wf.edges : [];

   wf.edges = (wf.edges as any[]).filter((e) => {
      if (!e) return true;
      if (e.target_node !== nodeModal.nodeId) return true;
      if (String(e.target_input || "") !== targetInput) return true;
      if (String(e.target_input || "") === CONTROL_PORT_NAME) return true;
      if (isControlFlowOutputName(String(e.source_output || ""))) return true;
      return false;
   });

   (wf.edges as any[]).push({
      id: `edge-hidden-${sourceNode}-${nodeModal.nodeId}-${targetInput}-${sourceOutput}-${Date.now().toString(36)}`,
      source_node: sourceNode,
      source_output: sourceOutput,
      source_path: String(sourcePath || "").trim() || undefined,
      target_node: nodeModal.nodeId,
      target_input: targetInput,
   });
};

const openUpstreamSelector = (targetInput: string, applyAs: "ref" | "wire") => {
   upstreamModal.targetInput = targetInput;
   upstreamModal.applyAs = applyAs;
   upstreamModal.visible = true;

   if (!upstreamPicker.nodeId) {
      upstreamPicker.nodeId = upstreamNodes.value[0]?.id || "";
   }
   upstreamPicker.output = "";
   upstreamPicker.subpath = "";
   upstreamPicker.selectedKey = "";
};

const closeUpstreamSelector = () => {
   upstreamModal.visible = false;
   upstreamModal.targetInput = "";
};

const applyUpstreamSelection = () => {
   const targetInput = upstreamModal.targetInput;
   if (!targetInput) return;
   if (!upstreamPicker.nodeId || !upstreamPicker.output) return;

   if (upstreamModal.applyAs === "wire") {
      inputMode[targetInput] = "wire";
      addHiddenDataEdgeForInput(targetInput, upstreamPicker.nodeId, upstreamPicker.output, upstreamPicker.subpath);
      closeUpstreamSelector();
      return;
   }

   inputMode[targetInput] = "ref";
   formValues[targetInput] = buildUpstreamExpr(upstreamPicker.nodeId, upstreamPicker.output, upstreamPicker.subpath);
   removeHiddenDataEdgeByInput(targetInput);
   closeUpstreamSelector();
};

const formatWirePathSuffix = (path: string) => {
   const trimmed = String(path || "").trim();
   if (!trimmed) return "";
   if (trimmed.startsWith(".") || trimmed.startsWith("[")) return trimmed;
   return `.${trimmed}`;
};

const normalizeSubpath = (subpath: string) => {
   return formatWirePathSuffix(subpath);
};

const buildUpstreamExpr = (nodeId: string, output: string, subpath: string) => {
   const suffix = normalizeSubpath(subpath);
   return `{{ nodes.${nodeId}.${output}${suffix} }}`;
};

const makeTreeKey = (output: string, subpath: string) => `${output}|${subpath || ''}`;
const parseTreeKey = (key: string) => {
   const idx = key.indexOf('|');
   if (idx < 0) return { output: key, subpath: '' };
   return { output: key.slice(0, idx), subpath: key.slice(idx + 1) };
};

const upstreamTreeData = computed(() => {
   const selected = upstreamNodes.value.find((n) => n.id === upstreamPicker.nodeId);
   const outputs = ((selected?.action?.outputs || []) as Array<{ name?: string }>) || [];
   const outputNames = outputs.map((o) => String(o?.name || '').trim()).filter(Boolean);
   const names = outputNames.length ? outputNames : ['event'];

   return names.map((name) => {
      if (name !== 'event') {
         return { label: name, key: makeTreeKey(name, '') };
      }

      const children = [
         { label: 'type', key: makeTreeKey('event', 'type') },
         { label: 'node_id', key: makeTreeKey('event', 'node_id') },
         { label: 'workflow_id', key: makeTreeKey('event', 'workflow_id') },
         { label: 'timestamp', key: makeTreeKey('event', 'timestamp') },
         {
            label: 'raw_event',
            key: makeTreeKey('event', 'raw_event'),
            children: [
               { label: 'message', key: makeTreeKey('event', 'raw_event.message') },
               { label: 'callback_query', key: makeTreeKey('event', 'raw_event.callback_query') },
               { label: 'chat', key: makeTreeKey('event', 'raw_event.chat') },
               { label: 'from', key: makeTreeKey('event', 'raw_event.from') },
               { label: 'data', key: makeTreeKey('event', 'raw_event.data') },
            ],
         },
      ];

      return { label: name, key: makeTreeKey(name, ''), children };
   });
});

const onUpstreamTreeSelect = (keys: Array<string | number>) => {
   const key = keys && keys.length ? String(keys[0]) : '';
   upstreamPicker.selectedKey = key;
   if (!key) {
      upstreamPicker.output = '';
      upstreamPicker.subpath = '';
      return;
   }
   const parsed = parseTreeKey(key);
   upstreamPicker.output = parsed.output;
   upstreamPicker.subpath = parsed.subpath;
};

watch(
   () => upstreamPicker.nodeId,
   () => {
      upstreamPicker.output = '';
      upstreamPicker.subpath = '';
      upstreamPicker.selectedKey = '';
   }
);

watch(
   () => wireActiveSource.source_path,
   () => {
      if (wireDrag.active) {
         wireDrag.source_path = String(wireActiveSource.source_path || "");
         updateWireDragTemp();
      }
   }
);

const setInputMode = (input: any, mode: InputMode) => {
   const name = String(input?.name || "");
   if (!name) return;

   inputMode[name] = mode;

   if (mode !== "wire") {
      removeHiddenDataEdgeByInput(name);
   }

   if (mode === "wire") {
      if (!getHiddenEdgeByInput(name) && upstreamNodeOptions.value.length) {
         goToWiringBoard(name);
      }
      return;
   }

   if (mode === "ref") {
      if (typeof formValues[name] !== "string") {
         formValues[name] = "";
      }
      return;
   }

   // literal mode coercion
   const type = String(input?.type || "");
   if (type === "boolean" || type === "bool") {
      if (typeof formValues[name] !== "boolean") {
         formValues[name] = Boolean(input?.default ?? false);
      }
      return;
   }
   if (type === "integer" || type === "number") {
      const n = typeof formValues[name] === "number" ? formValues[name] : Number(formValues[name]);
      formValues[name] = Number.isFinite(n) ? n : (input?.default ?? null);
      return;
   }
   if (Array.isArray(input?.options) && input.options.length) {
      const values = input.options.map((o: any) => String(o?.value ?? ""));
      const current = String(formValues[name] ?? "");
      if (!values.includes(current)) {
         formValues[name] = input?.default ?? values[0] ?? "";
      }
   }
};

const describeUpstreamRef = (value: unknown) => {
   const str = typeof value === 'string' ? value : '';
   if (!str) return '';
   const matches = str.match(/\{\{\s*nodes\.[^}]+\}\}/g) || [];
   if (!matches.length) return '';
   const firstMatch = matches[0];
   if (!firstMatch) return '';
   const first = firstMatch.replace(/^\{\{\s*/, '').replace(/\s*\}\}$/, '');
   if (matches.length === 1) return t("workflow.nodeModal.params.refPreviewSingle", { expr: first });
   return t("workflow.nodeModal.params.refPreviewMulti", { expr: first, count: matches.length });
};

const openNodeModal = (nodeId: string) => {
    if (!editor.value) return;
    const node = editor.value.getNodeFromId(nodeId);
    if (!node) return;
    
    // Refresh palette ensures we have latest action defs
    const actionId = node.data?.action?.id;
    // We assume the action inside node data is sufficient, or look it up from store
    // Use store palette lookup for fresh definition
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const palette = (store as any).buildActionPalette ? (store as any).buildActionPalette() : {};
    const action = palette[actionId] || node.data.action;
    
    nodeModal.nodeId = nodeId;
    nodeModal.action = action;
    nodeModal.originalData = { ...(node.data.data || {}) };
    nodeModal.visible = true;
    nodeModalTab.value = "params";
     
    // Reset form
    Object.keys(formValues).forEach(k => delete formValues[k]);
    Object.keys(inputMode).forEach(k => delete inputMode[k]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    nodeInputs.value.forEach((input: any) => {
        formValues[input.name] = nodeModal.originalData[input.name] ?? input.default ?? "";
    });
    // init mode
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    nodeInputs.value.forEach((input: any) => {
       const name = String(input?.name || "");
       if (!name) return;
       const edge = getHiddenEdgeByInput(name);
       if (edge) {
          inputMode[name] = "wire";
          return;
       }
       const v = formValues[name];
       inputMode[name] = typeof v === "string" && v.includes("{{") && v.includes("nodes.") ? "ref" : "literal";
    });

     // Params panel selection/filter
     paramsSearchTerm.value = "";
     const paramsInputs = wireableNodeInputs.value;
     const connected = paramsInputs.find((input: any) => getHiddenEdgeByInput(String(input?.name || "")));
     paramsActiveInputName.value = String(connected?.name || paramsInputs[0]?.name || "");
     
    rawJson.value = JSON.stringify(nodeModal.originalData, null, 2);
    useRawJson.value = false;

    upstreamPicker.nodeId = '';
    upstreamPicker.output = '';
    upstreamPicker.subpath = '';
    upstreamPicker.selectedKey = '';
    closeUpstreamSelector();

     // Reset wiring-board state to avoid leaking selection/filters between nodes.
     wireFilter.upstream = "";
     wireFilter.inputs = "";
     wireFilter.onlyConnected = false;
     wireShowWires.value = true;
     wireFocusOnly.value = true;
     wireFocusInput.value = "";
     wirePathEditingInput.value = "";
     wirePathDraft.value = "";
     clearWireSource();
     wireLines.value = [];
     if (wireOverlayRaf) {
        window.cancelAnimationFrame(wireOverlayRaf);
        wireOverlayRaf = 0;
     }
};

const closeNodeModal = () => {
   nodeModal.visible = false;
   closeUpstreamSelector();
   paramsSearchTerm.value = "";
   paramsActiveInputName.value = "";
   clearWireSource();
   wireFocusInput.value = "";
   wirePathEditingInput.value = "";
   wirePathDraft.value = "";
   wireLines.value = [];
   if (wireOverlayRaf) {
      window.cancelAnimationFrame(wireOverlayRaf);
      wireOverlayRaf = 0;
   }
};

const saveNodeConfig = () => {
    let finalData = { ...nodeModal.originalData };
    if (useRawJson.value) {
       try {
         finalData = JSON.parse(rawJson.value);
         // eslint-disable-next-line @typescript-eslint/no-explicit-any
       } catch(e: any) {
         // eslint-disable-next-line @typescript-eslint/no-explicit-any
         showInfoModal(t("workflow.jsonParseFailed", { error: e.message }), true);
         return;
       }
    } else {
       Object.assign(finalData, formValues);
    }
    
    if (editor.value) {
       const node = editor.value.getNodeFromId(nodeModal.nodeId);
       if (node && node.data) {
          // 使用 Drawflow API 正确更新节点数据，确保内部状态同步
          const updatedNodeData = { ...node.data, data: finalData };
          editor.value.updateNodeDataFromId(nodeModal.nodeId, updatedNodeData);
       }
    }
    closeNodeModal();
};

  return {
    nodeModal,
    nodeModalTab,
    rawJson,
    useRawJson,
    paramsSearchTerm,
    filteredParamInputs,
    wireableNodeInputs,
    paramsActiveInputName,
    selectParamInput,
    inputMode,
    getHiddenEdgeByInput,
    getNodeLabel,
    formatWirePathSuffix,
    describeUpstreamRef,
    formValues,
    activeParamInput,
    setInputMode,
    upstreamNodeOptions,
    goToWiringBoard,
    openUpstreamSelector,
    convertHiddenDataEdgeToRefByInput,
    removeHiddenDataEdgeByInput,
    getInputSelectOptions,
    closeNodeModal,
    saveNodeConfig,
    wireFilter,
    wireShowWires,
    wireFocusOnly,
    wireActiveSource,
    clearWireSource,
    filteredUpstreamWireNodes,
    getFilteredUpstreamDataOutputs,
    selectWireSource,
    wireDrag,
    registerWirePortEl,
    makeWireSrcKey,
    makeWireInKey,
    scheduleWireOverlayRecalc,
    startWireDrag,
    filteredWireInputRows,
    wireFocusInput,
    setWireFocus,
    wirePathEditingInput,
    wirePathDraft,
    saveWirePathEdit,
    connectWireToInput,
    beginWirePathEdit,
    wireVisibleLines,
    upstreamWireNodes,
    upstreamModal,
    upstreamPicker,
    upstreamTreeData,
    onUpstreamTreeSelect,
    buildUpstreamExpr,
    closeUpstreamSelector,
    applyUpstreamSelection,
    openNodeModal,
    handleWireResize,
  };
}

