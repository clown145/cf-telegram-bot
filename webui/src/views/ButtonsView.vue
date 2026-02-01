<template>
  <main class="layout-page">
    <div class="layout-container">
      <div id="menus-column">
        <section id="menuSection">
          <h2>
            {{ t("buttons.menus") }}
            <button class="secondary" style="margin-left: 8px" @click="addMenu">{{ t("buttons.addMenu") }}</button>
          </h2>
          <div v-if="menuList.length === 0" class="muted">{{ t("buttons.emptyMenus") }}</div>
          <details v-for="menu in menuList" :key="menu.id" open>
            <summary>{{ menu.id }} ({{ menu.name || t("common.unnamed") }})</summary>
            <div class="details-content">
              <div class="field">
                <label>{{ t("buttons.menuName") }}</label>
                <input v-model="menu.name" type="text" />
              </div>
              <div class="field">
                <label>{{ t("buttons.menuHeader") }}</label>
                <textarea v-model="menu.header" rows="2"></textarea>
              </div>
              <div class="menu-layout-grid" :data-menu-id="menu.id">
                <div
                  v-for="(row, rowIndex) in menuRows[menu.id]"
                  :key="`${menu.id}-row-${rowIndex}`"
                  class="menu-layout-row"
                  :class="{ 'empty-row': row.length === 0 }"
                  :data-menu-id="menu.id"
                  :data-row-index="rowIndex"
                >
                  <div
                    v-for="button in row"
                    :key="button.id"
                    class="menu-btn-wrapper"
                    :data-button-id="button.id"
                    @dblclick.stop="openButtonEditor(button.id, menu.id)"
                  >
                    {{ button.text || button.id }}
                  </div>
                </div>
              </div>
              <button class="danger" style="margin-top: 12px" @click="removeMenu(menu.id)">
                {{ t("buttons.deleteMenu") }}
              </button>
            </div>
          </details>
        </section>
      </div>

      <div id="button-bank-column">
        <section id="buttonBankSection">
          <h2>
            {{ t("buttons.unassigned") }}
            <button class="secondary" style="margin-left: 8px" @click="addButton">{{ t("buttons.addButton") }}</button>
          </h2>
          <div class="menu-layout-row" data-unassigned="true">
            <div
              v-for="button in unassigned"
              :key="button.id"
              class="menu-btn-wrapper"
              :data-button-id="button.id"
              @dblclick.stop="openButtonEditor(button.id, null)"
            >
              {{ button.text || button.id }}
            </div>
          </div>
          <p v-if="unassigned.length === 0" class="muted" style="margin-top: 12px;">
            {{ t("buttons.emptyUnassigned") }}
          </p>
        </section>
      </div>
    </div>

    <div v-if="editor.visible" class="modal-overlay visible" @click.self="closeEditor">
      <div class="modal-container">
        <div class="modal-header">
          <h2>{{ editor.isNew ? t("buttons.editor.createTitle") : t("buttons.editor.editTitle") }}</h2>
          <button class="close-btn" @click="closeEditor">&times;</button>
        </div>
        <div class="modal-body">
          <div class="field">
            <label>{{ t("buttons.editor.textLabel") }}</label>
            <input v-model="editor.form.text" type="text" />
          </div>
          <div class="field">
            <label>{{ t("buttons.editor.typeLabel") }}</label>
            <select v-model="editor.form.type">
              <option v-for="opt in typeOptions" :key="opt.value" :value="opt.value">
                {{ opt.label }}
              </option>
            </select>
          </div>
          <div class="field" v-if="editor.form.type === 'command'">
            <label>{{ t("buttons.editor.payload.command") }}</label>
            <input v-model="editor.form.payload.command" type="text" />
          </div>
          <div class="field" v-else-if="editor.form.type === 'url'">
            <label>{{ t("buttons.editor.payload.url") }}</label>
            <input v-model="editor.form.payload.url" type="text" />
          </div>
          <div class="field" v-else-if="editor.form.type === 'submenu'">
            <label>{{ t("buttons.editor.payload.submenu") }}</label>
            <select v-model="editor.form.payload.menu_id">
              <option value="">{{ t("buttons.editor.payload.selectPlaceholder") }}</option>
              <option v-for="menu in menuList" :key="menu.id" :value="menu.id">
                {{ menu.name || menu.id }}
              </option>
            </select>
          </div>
          <div class="field" v-else-if="editor.form.type === 'web_app'">
            <label>{{ t("buttons.editor.payload.webApp") }}</label>
            <select v-model="editor.form.payload.web_app_id">
              <option value="">{{ t("buttons.editor.payload.selectPlaceholder") }}</option>
              <option v-for="webApp in webAppOptions" :key="webApp.value" :value="webApp.value">
                {{ webApp.label }}
              </option>
            </select>
          </div>
          <div class="field" v-else-if="editor.form.type === 'action'">
            <label>{{ t("buttons.editor.payload.action") }}</label>
            <select v-model="editor.form.payload.action_id">
              <option value="">{{ t("buttons.editor.payload.selectPlaceholder") }}</option>
              <option v-for="action in actionOptions" :key="action.value" :value="action.value">
                {{ action.label }}
              </option>
            </select>
          </div>
          <div class="field" v-else-if="editor.form.type === 'workflow'">
            <label>{{ t("buttons.editor.payload.workflow") }}</label>
            <select v-model="editor.form.payload.workflow_id">
              <option value="">{{ t("buttons.editor.payload.selectPlaceholder") }}</option>
              <option v-for="wf in workflowOptions" :key="wf.value" :value="wf.value">
                {{ wf.label }}
              </option>
            </select>
          </div>
          <div class="field" v-else-if="editor.form.type === 'inline_query'">
            <label>{{ t("buttons.editor.payload.inlineQuery") }}</label>
            <input v-model="editor.form.payload.query" type="text" />
          </div>
          <div class="field" v-else-if="editor.form.type === 'switch_inline_query'">
            <label>{{ t("buttons.editor.payload.switchInline") }}</label>
            <input v-model="editor.form.payload.query" type="text" />
          </div>
          <div class="field" v-else-if="editor.form.type === 'raw'">
            <label>{{ t("buttons.editor.payload.raw") }}</label>
            <textarea v-model="editor.form.payload.callback_data" rows="3"></textarea>
          </div>
        </div>
        <div class="modal-footer">
          <div style="display: flex; justify-content: space-between; width: 100%; gap: 12px;">
            <div style="display: flex; gap: 8px;">
              <button
                v-if="!editor.isNew && editor.menuId"
                class="danger"
                @click="removeFromMenu(editor.menuId, editor.buttonId)"
              >
                {{ t("buttons.editor.removeFromMenu") }}
              </button>
              <button v-if="!editor.isNew" class="danger" @click="deleteButton(editor.buttonId)">
                {{ t("buttons.editor.deleteButton") }}
              </button>
            </div>
            <div style="display: flex; gap: 8px;">
              <button class="secondary" @click="closeEditor">{{ t("common.cancel") }}</button>
              <button @click="saveEditor">
                {{ editor.isNew ? t("buttons.editor.create") : t("buttons.editor.save") }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </main>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import Sortable from "sortablejs";
import { useAppStore, ButtonDefinition, MenuDefinition } from "../stores/app";
import { apiJson } from "../services/api";
import { useI18n } from "../i18n";

const store = useAppStore();
const { t } = useI18n();
const menuRows = ref<Record<string, ButtonDefinition[][]>>({});
const unassigned = ref<ButtonDefinition[]>([]);
const sortables = ref<Sortable[]>([]);
let sortableInitScheduled = false;
let lastEditorType: string | null = null;
let isDragging = false;
let pendingRebuild = false;
const handleKeydown = (event: KeyboardEvent) => {
  if (event.key === "Escape" && editor.visible) {
    closeEditor();
  }
};
const editor = reactive({
  visible: false,
  isNew: false,
  buttonId: "",
  menuId: null as string | null,
  form: {
    text: "",
    type: "command",
    payload: {} as Record<string, any>,
  },
});

const typeOptions = computed(() => [
  { value: "command", label: t("buttons.editor.types.command") },
  { value: "url", label: t("buttons.editor.types.url") },
  { value: "submenu", label: t("buttons.editor.types.submenu") },
  { value: "web_app", label: t("buttons.editor.types.webApp") },
  { value: "action", label: t("buttons.editor.types.action") },
  { value: "workflow", label: t("buttons.editor.types.workflow") },
  { value: "inline_query", label: t("buttons.editor.types.inlineQuery") },
  { value: "switch_inline_query", label: t("buttons.editor.types.switchInline") },
  { value: "raw", label: t("buttons.editor.types.raw") },
]);

const actionOptions = computed(() =>
  Object.keys(store.state.actions || {}).map((id) => ({
    value: id,
    label: `${store.state.actions[id].name || id} (${id})`,
  }))
);

const webAppOptions = computed(() =>
  Object.keys(store.state.web_apps || {}).map((id) => ({
    value: id,
    label: `${store.state.web_apps[id].name || id} (${id})`,
  }))
);

const workflowOptions = computed(() =>
  Object.keys(store.state.workflows || {}).map((id) => ({
    value: id,
    label: store.state.workflows[id].name || id,
  }))
);

const menuList = computed<MenuDefinition[]>(() => {
  return Object.values(store.state.menus || {});
});

const rebuildLayout = () => {
  if (isDragging) {
    pendingRebuild = true;
    return;
  }
  const rowsMap: Record<string, ButtonDefinition[][]> = {};
  const assigned = new Set<string>();

  for (const menu of menuList.value) {
    const rowBuckets = new Map<number, ButtonDefinition[]>();
    for (const buttonId of menu.items || []) {
      const btn = store.state.buttons?.[buttonId];
      if (!btn) continue;
      const row = btn.layout?.row ?? 0;
      const col = btn.layout?.col ?? 0;
      if (!rowBuckets.has(row)) rowBuckets.set(row, []);
      rowBuckets.get(row)!.push(btn);
      (btn as any).__tmpCol = col;
      assigned.add(btn.id);
    }

    const rowIndexes = Array.from(rowBuckets.keys()).sort((a, b) => a - b);
    const rows: ButtonDefinition[][] = rowIndexes.map((idx) => {
      const list = rowBuckets.get(idx) || [];
      list.sort((a, b) => ((a as any).__tmpCol ?? 0) - ((b as any).__tmpCol ?? 0));
      list.forEach((item) => delete (item as any).__tmpCol);
      return list;
    });

    ensureTrailingEmptyRow(rows);
    rowsMap[menu.id] = rows;
  }

  const unassignedList: ButtonDefinition[] = [];
  for (const btn of Object.values(store.state.buttons || {})) {
    if (!assigned.has(btn.id)) {
      unassignedList.push(btn);
    }
  }
  menuRows.value = rowsMap;
  unassigned.value = unassignedList;
  scheduleSortableInit();
};

const ensureTrailingEmptyRow = (rows: ButtonDefinition[][]) => {
  if (rows.length === 0 || rows[rows.length - 1].length > 0) {
    rows.push([]);
  }
};

const syncLayout = () => {
  const assigned = new Set<string>();

  for (const menu of menuList.value) {
    const rows = menuRows.value[menu.id] || [];
    const cleanedRows: ButtonDefinition[][] = [];
    const items: string[] = [];
    let rowIndex = 0;
    for (const row of rows) {
      if (!row || row.length === 0) {
        continue;
      }
      cleanedRows.push(row);
      row.forEach((btn, colIndex) => {
        if (!btn.layout) btn.layout = {};
        btn.layout.row = rowIndex;
        btn.layout.col = colIndex;
        btn.layout.rowspan = btn.layout.rowspan ?? 1;
        btn.layout.colspan = btn.layout.colspan ?? 1;
        items.push(btn.id);
        assigned.add(btn.id);
      });
      rowIndex += 1;
    }
    menu.items = items;
    ensureTrailingEmptyRow(cleanedRows);
    menuRows.value[menu.id] = cleanedRows;
  }

  for (const btn of Object.values(store.state.buttons || {})) {
    if (!assigned.has(btn.id)) {
      if (btn.layout) {
        delete btn.layout.row;
        delete btn.layout.col;
      }
    }
  }

  const newUnassigned = unassigned.value.filter((btn) => !assigned.has(btn.id));
  for (const btn of Object.values(store.state.buttons || {})) {
    if (!assigned.has(btn.id) && !newUnassigned.find((entry) => entry.id === btn.id)) {
      newUnassigned.push(btn);
    }
  }
  unassigned.value = newUnassigned;
};

// DOM drives drag ordering; we rebuild data after drop.

const applyDomLayout = () => {
  const assigned = new Set<string>();

  document.querySelectorAll<HTMLElement>(".menu-layout-grid").forEach((grid) => {
    const menuId = grid.dataset.menuId;
    if (!menuId || !store.state.menus?.[menuId]) {
      return;
    }
    const items: string[] = [];
    grid.querySelectorAll<HTMLElement>(".menu-layout-row").forEach((rowEl, rowIndex) => {
      const buttons = rowEl.querySelectorAll<HTMLElement>(".menu-btn-wrapper");
      buttons.forEach((btnEl, colIndex) => {
        const btnId = btnEl.dataset.buttonId;
        const btn = btnId ? store.state.buttons?.[btnId] : null;
        if (!btnId || !btn) return;
        if (!btn.layout) btn.layout = {};
        btn.layout.row = rowIndex;
        btn.layout.col = colIndex;
        btn.layout.rowspan = btn.layout.rowspan ?? 1;
        btn.layout.colspan = btn.layout.colspan ?? 1;
        items.push(btnId);
        assigned.add(btnId);
      });
    });
    store.state.menus[menuId].items = items;
  });

  const unassignedContainer = document.querySelector<HTMLElement>('.menu-layout-row[data-unassigned="true"]');
  if (unassignedContainer) {
    unassignedContainer.querySelectorAll<HTMLElement>(".menu-btn-wrapper").forEach((btnEl) => {
      const btnId = btnEl.dataset.buttonId;
      const btn = btnId ? store.state.buttons?.[btnId] : null;
      if (!btnId || !btn) return;
      delete btn.layout?.row;
      delete btn.layout?.col;
      assigned.add(btnId);
    });
  }

  for (const btn of Object.values(store.state.buttons || {})) {
    if (!assigned.has(btn.id)) {
      if (btn.layout) {
        delete btn.layout.row;
        delete btn.layout.col;
      }
    }
  }
};

const handleSortEnd = () => {
  isDragging = false;
  document.body.classList.remove("is-touch-dragging");

  requestAnimationFrame(() => {
    applyDomLayout();
    if (pendingRebuild) {
      pendingRebuild = false;
    }
    rebuildLayout();
  });
};

const destroySortables = () => {
  sortables.value.forEach((instance) => {
    if (!instance) return;
    try {
      instance.destroy();
    } catch {
      // ignore
    }
  });
  sortables.value = [];
  isDragging = false;
};

const pruneSortables = () => {
  sortables.value = sortables.value.filter((instance) => {
    if (!instance?.el) return false;
    if (!document.contains(instance.el)) {
      try {
        instance.destroy();
      } catch {
        // ignore
      }
      return false;
    }
    return true;
  });
};

const initSortables = () => {
  pruneSortables();
  const containers = document.querySelectorAll<HTMLElement>(".menu-layout-row");
  const isTouch =
    typeof window !== "undefined" &&
    (window.matchMedia?.("(pointer: coarse)").matches || "ontouchstart" in window);
  containers.forEach((container) => {
    const existing = Sortable.get(container);
    if (existing) {
      return;
    }
    const sortable = Sortable.create(container, {
      group: { name: "buttons", pull: true, put: true },
      draggable: ".menu-btn-wrapper",
      animation: 150,
      ghostClass: "sortable-ghost",
      dragClass: "sortable-drag",
      chosenClass: "sortable-chosen",
      fallbackOnBody: true,
      forceFallback: isTouch,
      fallbackTolerance: 0,
      touchStartThreshold: 0,
      delay: isTouch ? 120 : 0,
      delayOnTouchOnly: isTouch,
      scroll: true,
      scrollSensitivity: 40,
      emptyInsertThreshold: 12,
      onStart: () => {
        isDragging = true;
        document.body.classList.add("is-touch-dragging");
      },
      onEnd: handleSortEnd,
      onCancel: () => {
        document.body.classList.remove("is-touch-dragging");
      },
    });
    sortables.value.push(sortable);
  });
};

const scheduleSortableInit = () => {
  if (sortableInitScheduled) return;
  if (isDragging) return;
  sortableInitScheduled = true;
  requestAnimationFrame(async () => {
    sortableInitScheduled = false;
    await nextTick();
    if (isDragging) return;
    initSortables();
  });
};

const addMenu = async () => {
  const id = await generateId("menu");
  store.state.menus[id] = {
    id,
    name: t("buttons.defaultMenuName"),
    header: t("buttons.defaultMenuHeader"),
    items: [],
  };
  rebuildLayout();
};

const addButton = () => {
  openButtonEditor(null, null);
};

const removeMenu = (menuId: string) => {
  if (menuId === "root") {
    (window as any).showInfoModal?.(t("buttons.rootProtected"), true);
    return;
  }
  (window as any).showConfirmModal?.(
    t("buttons.deleteMenuTitle"),
    t("buttons.deleteMenuMessage", { menuId }),
    () => {
      delete store.state.menus[menuId];
      rebuildLayout();
    }
  );
};

const generateId = async (kind: string): Promise<string> => {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 3000);
  try {
    const response = await apiJson<{ id: string }>("/api/util/ids", {
      method: "POST",
      body: JSON.stringify({ type: kind }),
      signal: controller.signal,
    });
    return response.id;
  } catch (error: any) {
    const fallback = `${kind}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    (window as any).showInfoModal?.(
      t("buttons.editor.idFallback", { id: fallback, error: error.message || error }),
      true
    );
    return fallback;
  } finally {
    window.clearTimeout(timeout);
  }
};

const openButtonEditor = (buttonId: string | null, menuId: string | null) => {
  editor.visible = true;
  editor.isNew = !buttonId;
  editor.buttonId = buttonId || "";
  editor.menuId = menuId;
  if (buttonId && store.state.buttons?.[buttonId]) {
    const source = store.state.buttons[buttonId];
    editor.form = {
      text: source.text || "",
      type: source.type || "command",
      payload: { ...(source.payload || {}) },
    };
  } else {
    editor.form = {
      text: t("buttons.defaultButtonName"),
      type: "command",
      payload: {},
    };
  }
  lastEditorType = editor.form.type;
};

const closeEditor = () => {
  editor.visible = false;
};

watch(
  () => editor.form.type,
  (next) => {
    if (!editor.visible) return;
    if (lastEditorType !== null && next !== lastEditorType) {
      editor.form.payload = {};
    }
    lastEditorType = next;
  }
);

const saveEditor = async () => {
  if (!editor.form.text) {
    editor.form.text = t("buttons.defaultButtonName");
  }
  try {
    if (editor.isNew) {
      const id = await generateId("button");
      store.state.buttons[id] = {
        id,
        text: editor.form.text,
        type: editor.form.type,
        payload: { ...editor.form.payload },
        layout: { row: 0, col: 0, rowspan: 1, colspan: 1 },
      };
    } else if (editor.buttonId) {
      const existing = store.state.buttons[editor.buttonId];
      if (existing) {
        store.state.buttons[editor.buttonId] = {
          ...existing,
          text: editor.form.text,
          type: editor.form.type,
          payload: { ...editor.form.payload },
        };
      }
    }
    closeEditor();
    rebuildLayout();
  } catch {
    // error already surfaced in generateId
  }
};

const removeFromMenu = (menuId: string, buttonId: string) => {
  (window as any).showConfirmModal?.(
    t("buttons.editor.removeFromMenuTitle"),
    t("buttons.editor.removeFromMenuMessage", { menuId }),
    () => {
      const menu = store.state.menus?.[menuId];
      if (menu) {
        menu.items = (menu.items || []).filter((id) => id !== buttonId);
        rebuildLayout();
      }
      closeEditor();
    }
  );
};

const deleteButton = (buttonId: string) => {
  const button = store.state.buttons?.[buttonId];
  const name = button?.text || buttonId;
  (window as any).showConfirmModal?.(
    t("buttons.editor.deleteButtonTitle"),
    t("buttons.editor.deleteButtonMessage", { name }),
    () => {
      delete store.state.buttons[buttonId];
      Object.values(store.state.menus || {}).forEach((menu) => {
        menu.items = (menu.items || []).filter((id) => id !== buttonId);
      });
      rebuildLayout();
      closeEditor();
    }
  );
};

watch(
  () => store.state,
  () => {
    rebuildLayout();
  },
  { immediate: true }
);

onMounted(async () => {
  if (!store.loading && Object.keys(store.state.buttons || {}).length === 0) {
    await store.loadAll();
  }
  rebuildLayout();
  window.addEventListener("keydown", handleKeydown);
});

onBeforeUnmount(() => {
  destroySortables();
  window.removeEventListener("keydown", handleKeydown);
});
</script>
