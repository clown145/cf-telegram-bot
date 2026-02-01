<template>
  <main class="layout-page">
    <div class="layout-container">
      <div id="menus-column">
        <section id="menuSection">
          <h2>
            {{ t("buttons.menus") }}
            <n-button type="success" size="small" style="margin-left: 8px" @click="addMenu">
              {{ t("buttons.addMenu") }}
            </n-button>
          </h2>
          <div v-if="menuList.length === 0" class="muted">{{ t("buttons.emptyMenus") }}</div>
          <n-collapse v-model:expanded-names="expandedNames" class="menu-collapse">
            <n-collapse-item v-for="menu in menuList" :key="menu.id" :name="menu.id">
              <template #header>
                <span class="collapse-header-text">{{ menu.id }} ({{ menu.name || t("common.unnamed") }})</span>
              </template>
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
            </n-collapse-item>
          </n-collapse>
        </section>
      </div>

      <!-- Button Bank (Overlay Palette) -->
      <div id="button-bank-column" :class="{ 'palette-collapsed': isBankCollapsed }">
        <!-- Inner Container for Content (scales/clips) -->
        <div class="bank-palette-container">
            <section id="buttonBankSection">
              <h2>
                {{ t("buttons.unassigned") }}
                <n-button type="success" size="small" style="margin-left: 8px" @click="addButton">
                  {{ t("buttons.addButton") }}
                </n-button>
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

        <!-- Toggle Button (Absolute inside wrapper) -->
        <button 
           class="bank-toggle-btn" 
           @click="toggleBank"
           :title="isBankCollapsed ? t('buttons.showBank') : t('buttons.hideBank')"
        >
           <!-- Caret Icon constructed via CSS like workflow editor, or SVG -->
           <span class="caret-icon"></span>
        </button>
      </div>
    </div>

    <n-modal
      v-model:show="editor.visible"
      preset="card"
      :title="editor.isNew ? t('buttons.editor.createTitle') : t('buttons.editor.editTitle')"
      style="width: 600px; max-width: 90vw;"
      @close="closeEditor"
    >
      <n-form :model="editor.form" label-placement="top">
        <n-form-item :label="t('buttons.editor.textLabel')">
          <n-input v-model:value="editor.form.text" />
        </n-form-item>
        
        <n-form-item :label="t('buttons.editor.typeLabel')">
          <n-select v-model:value="editor.form.type" :options="typeOptions" />
        </n-form-item>

        <template v-if="editor.form.type === 'command'">
          <n-form-item :label="t('buttons.editor.payload.command')">
            <n-input v-model:value="editor.form.payload.command" />
          </n-form-item>
        </template>
        
        <template v-else-if="editor.form.type === 'url'">
          <n-form-item :label="t('buttons.editor.payload.url')">
            <n-input v-model:value="editor.form.payload.url" />
          </n-form-item>
        </template>
        
        <template v-else-if="editor.form.type === 'submenu'">
          <n-form-item :label="t('buttons.editor.payload.submenu')">
            <n-select 
               v-model:value="editor.form.payload.menu_id" 
               :options="menuList.map(m => ({ label: m.name || m.id, value: m.id }))" 
               filterable 
            />
          </n-form-item>
        </template>
        
        <template v-else-if="editor.form.type === 'web_app'">
          <n-form-item :label="t('buttons.editor.payload.webApp')">
            <n-select v-model:value="editor.form.payload.web_app_id" :options="webAppOptions" filterable />
          </n-form-item>
        </template>
        
        <template v-else-if="editor.form.type === 'action'">
          <n-form-item :label="t('buttons.editor.payload.action')">
            <n-select v-model:value="editor.form.payload.action_id" :options="actionOptions" filterable />
          </n-form-item>
        </template>
        
        <template v-else-if="editor.form.type === 'workflow'">
          <n-form-item :label="t('buttons.editor.payload.workflow')">
            <n-select v-model:value="editor.form.payload.workflow_id" :options="workflowOptions" filterable />
          </n-form-item>
        </template>
        
        <template v-else-if="editor.form.type === 'inline_query'">
          <n-form-item :label="t('buttons.editor.payload.inlineQuery')">
            <n-input v-model:value="editor.form.payload.query" />
          </n-form-item>
        </template>
        
        <template v-else-if="editor.form.type === 'switch_inline_query'">
          <n-form-item :label="t('buttons.editor.payload.switchInline')">
             <n-input v-model:value="editor.form.payload.query" />
          </n-form-item>
        </template>
        
        <template v-else-if="editor.form.type === 'raw'">
          <n-form-item :label="t('buttons.editor.payload.raw')">
             <n-input type="textarea" v-model:value="editor.form.payload.callback_data" />
          </n-form-item>
        </template>
      </n-form>

      <template #footer>
        <div style="display: flex; justify-content: space-between; width: 100%;">
          <n-space>
             <n-button
                v-if="!editor.isNew && editor.menuId"
                type="error"
                secondary
                @click="removeFromMenu(editor.menuId, editor.buttonId)"
              >
                {{ t("buttons.editor.removeFromMenu") }}
              </n-button>
              <n-button v-if="!editor.isNew" type="error" ghost @click="deleteButton(editor.buttonId)">
                {{ t("buttons.editor.deleteButton") }}
              </n-button>
          </n-space>
          
          <n-space>
            <n-button @click="closeEditor">{{ t("common.cancel") }}</n-button>
            <n-button type="primary" @click="saveEditor">
               {{ editor.isNew ? t("buttons.editor.create") : t("buttons.editor.save") }}
            </n-button>
          </n-space>
        </div>
      </template>
    </n-modal>
  </main>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import Sortable from "sortablejs";
import { 
  NModal, NForm, NFormItem, NInput, NSelect, NButton, NSpace, NCollapse, NCollapseItem 
} from "naive-ui";
import { useAppStore, ButtonDefinition, MenuDefinition } from "../stores/app";
import { apiJson } from "../services/api";
import { useI18n } from "../i18n";

const store = useAppStore();
const { t } = useI18n();
const menuRows = ref<Record<string, ButtonDefinition[][]>>({});
const unassigned = ref<ButtonDefinition[]>([]);
const sortables = ref<Sortable[]>([]);
const expandedNames = ref<string[]>([]);
const isBankCollapsed = ref(localStorage.getItem("tg-button-bank-collapsed") === "true");

const toggleBank = () => {
   isBankCollapsed.value = !isBankCollapsed.value;
   localStorage.setItem("tg-button-bank-collapsed", isBankCollapsed.value ? "true" : "false");
};

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

// Rebuilds the UI-facing menuRows structure from the authoritative Store state
const rebuildLayout = () => {
  if (isDragging) {
    pendingRebuild = true;
    return;
  }
  const rowsMap: Record<string, ButtonDefinition[][]> = {};
  const assigned = new Set<string>();

  for (const menu of menuList.value) {
    const rowBuckets = new Map<number, ButtonDefinition[]>();
    // Group buttons by row index
    for (const buttonId of menu.items || []) {
      const btn = store.state.buttons?.[buttonId];
      if (!btn) continue;
      const row = btn.layout?.row ?? 0;
      if (!rowBuckets.has(row)) rowBuckets.set(row, []);
      rowBuckets.get(row)!.push(btn);
      assigned.add(btn.id);
    }

    // Sort buttons within each row by col index
    rowBuckets.forEach((buttons) => {
      buttons.sort((a, b) => (a.layout?.col ?? 0) - (b.layout?.col ?? 0));
    });

    // Create array of rows. Fill gaps if necessary or just use what we have.
    // We want to ensure strictly sequential rows for the UI grid.
    const maxRow = Math.max(-1, ...Array.from(rowBuckets.keys()));
    // If empty menu, start with one empty row [[]]
    const rows: ButtonDefinition[][] = [];
    for (let i = 0; i <= maxRow + 1; i++) {
       rows.push(rowBuckets.get(i) || []); // Empty list if no buttons in this row
    }
    
    // Ensure at least one empty row at the end for dropping new items
    if (rows.length === 0 || rows[rows.length - 1].length > 0) {
      rows.push([]);
    }

    rowsMap[menu.id] = rows;
  }

  // Unassigned buttons
  const unassignedList: ButtonDefinition[] = [];
  for (const btn of Object.values(store.state.buttons || {})) {
    if (!assigned.has(btn.id)) {
      unassignedList.push(btn);
    }
  }
  menuRows.value = rowsMap;
  unassigned.value = unassignedList;
  
  // Sync expanded names to ensure all menus are visible for SortableJS
  const allIds = menuList.value.map(m => m.id);
  if (expandedNames.value.length === 0 && allIds.length > 0) {
    expandedNames.value = allIds;
  }

  scheduleSortableInit();
};

const syncMenuRowsToStore = () => {
  // 1. Clear current layouts from all menus in store to avoid stale data
  // But actually, we can just overwrite menu.items and button.layout
  
  for (const menuId of Object.keys(menuRows.value)) {
    const rows = menuRows.value[menuId];
    if (!rows) continue;
    
    const menu = store.state.menus[menuId];
    if (!menu) continue;

    const newItems: string[] = [];
    rows.forEach((row, rowIndex) => {
      row.forEach((btn, colIndex) => {
        // Update button layout in store
        // Ensure we are modifying the store object
        if (store.state.buttons[btn.id]) {
           const storeBtn = store.state.buttons[btn.id];
           if (!storeBtn.layout) storeBtn.layout = {};
           storeBtn.layout.row = rowIndex;
           storeBtn.layout.col = colIndex;
           newItems.push(btn.id);
        }
      });
    });
    menu.items = newItems;
  }
  
  // Clean up layout for unassigned
  unassigned.value.forEach(btn => {
     if (store.state.buttons[btn.id]) {
        const storeBtn = store.state.buttons[btn.id];
        if (storeBtn.layout) {
          delete storeBtn.layout.row;
          delete storeBtn.layout.col;
        }
     }
  });
};



const handleSortEnd = (evt: Sortable.SortableEvent) => {
  // If moving between lists or within list
  const { from, to, oldIndex, newIndex, item } = evt;
  
  if (oldIndex === undefined || newIndex === undefined) return;

  // Helper to resolve the source/target array based on DOM elements
  const getSourceArray = (el: HTMLElement): ButtonDefinition[] => {
    if (el.dataset.unassigned === "true") {
      return unassigned.value;
    }
    const menuId = el.dataset.menuId;
    const rowIndex = parseInt(el.dataset.rowIndex || "-1");
    if (menuId && rowIndex >= 0 && menuRows.value[menuId]) {
      return menuRows.value[menuId][rowIndex];
    }
    return [];
  };

  const sourceList = getSourceArray(from as HTMLElement);
  const targetList = getSourceArray(to as HTMLElement);

  if (!sourceList || !targetList) return;

  // Move the item in the data model
  const [movedItem] = sourceList.splice(oldIndex, 1);
  if (movedItem) {
    targetList.splice(newIndex, 0, movedItem);
  }

  // Sync back to store
  syncMenuRowsToStore();

  // Clean empty rows if needed (except the last one? actually syncMenuRowsToStore logic is store->menuRows not strictly reverse, 
  // but rebuildLayout regenerates menuRows from Store.
  // So we should rebuild layout to clean up empty internal rows if they became empty.
  isDragging = false;
  document.body.classList.remove("is-touch-dragging");

  requestAnimationFrame(() => {
    if (pendingRebuild) {
      pendingRebuild = false;
    }
    // We rebuild to normalize the structure (e.g. ensure trailing empty row, remove empty middle rows if desired)
    // rebuildLayout();
    
    // Lightweight normalization instead of full rebuild to prevent animation glitches
    if (to.dataset.menuId) {
       const rows = menuRows.value[to.dataset.menuId];
       if (rows) {
          // ensure last row is empty
          if (rows.length > 0 && rows[rows.length - 1].length > 0) {
              rows.push([]);
          }
          
          // Remove empty middle rows (iterate backwards, skip the last one)
          for (let i = rows.length - 2; i >= 0; i--) {
             if (rows[i].length === 0) {
                rows.splice(i, 1);
             }
          }
       }
    }
    
    // Ensure new rows are initialized with Sortable
    scheduleSortableInit();
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
      animation: 300,
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
    syncMenuRowsToStore(); // previously rebuildLayout, now we just save state? 
    // Actually, saving new button should trigger reactivity. 
    // But since we are moving away from full rebuild on every change if possible... 
    // Wait, adding a button needs to show it. rebuildLayout reads from store. So it is fine.
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
  // Check if ANY data is loaded to avoid overwriting unsaved changes
  const hasButtons = Object.keys(store.state.buttons || {}).length > 0;
  const hasWorkflows = Object.keys(store.state.workflows || {}).length > 0;

  if (!store.loading && !hasButtons && !hasWorkflows) {
    await store.loadAll();
  }
  rebuildLayout();
  window.addEventListener("keydown", handleKeydown);

  // 多次延迟初始化 Sortable，确保 n-collapse 内容区域完全渲染
  // n-collapse 在异步加载数据后可能需要额外的渲染时间
  const delayedInits = [0, 100, 300, 500];
  delayedInits.forEach((delay) => {
    setTimeout(() => {
      scheduleSortableInit();
    }, delay);
  });
});

onBeforeUnmount(() => {
  destroySortables();
  window.removeEventListener("keydown", handleKeydown);
});
</script>
