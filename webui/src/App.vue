<template>
  <n-config-provider
    :theme="naiveTheme"
    :locale="naiveLocale"
    :date-locale="naiveDateLocale"
    :theme-overrides="themeOverrides"
  >
    <div class="app-shell">
      <n-layout v-if="!isLogin" class="app-layout" :has-sider="!isMobile">
        <n-layout-sider
          v-if="!isMobile"
          v-model:collapsed="collapsed"
          class="app-sider"
          :width="240"
          :collapsed-width="72"
          collapse-mode="width"
          show-trigger="bar"
          bordered
        >
          <div class="app-sider-header" :class="{ collapsed }">
            <div class="app-title">{{ t("app.title") }}</div>
            <div class="app-subtitle">{{ t("app.subtitle") }}</div>
          </div>
          <div class="app-nav" ref="navRef">
            <div class="nav-indicator-layer">
              <div ref="navIndicator" class="nav-indicator"></div>
              <div ref="navIndicatorBlob" class="nav-indicator-blob"></div>
            </div>
            <n-menu :value="activeMenu" :options="menuOptions" @update:value="handleMenuUpdate" />
          </div>
        </n-layout-sider>

        <n-layout>
          <n-layout-header class="app-header" bordered>
            <div class="app-header-left">
              <n-button v-if="isMobile" size="small" secondary @click="mobileNavOpen = true">
                {{ t("app.menu") }}
              </n-button>
              <div class="app-page-title">{{ pageTitle }}</div>
            </div>
            <div class="app-header-actions">
              <n-button size="small" @click="refresh">{{ t("toolbar.refresh") }}</n-button>
              <n-button size="small" @click="saveAll">{{ t("toolbar.saveAll") }}</n-button>
              <n-button size="small" secondary @click="exportJson">{{ t("toolbar.export") }}</n-button>
              <div class="toolbar-label">
                <span>{{ t("app.language") }}</span>
                <n-select v-model:value="selectedLocale" :options="localeOptions" size="small" />
              </div>
            </div>
          </n-layout-header>

          <n-layout-content class="app-content">
            <RouterView />
          </n-layout-content>
        </n-layout>
      </n-layout>

      <div v-else class="app-login-wrapper">
        <RouterView />
      </div>

      <n-drawer v-if="isMobile && !isLogin" v-model:show="mobileNavOpen" placement="left" :width="260">
        <n-drawer-content>
          <div class="app-sider-header drawer-header">
            <div class="app-title">{{ t("app.title") }}</div>
            <div class="app-subtitle">{{ t("app.subtitle") }}</div>
          </div>
          <n-menu :value="activeMenu" :options="menuOptions" @update:value="handleMenuUpdate" />
        </n-drawer-content>
      </n-drawer>

      <div id="modal" class="modal-overlay" :class="{ visible: modal.visible }" @click.self="closeModal">
        <div class="modal-container">
          <div class="modal-header">
            <h2 id="modalTitle">{{ modal.title }}</h2>
            <button id="modalCloseBtn" class="close-btn" @click="closeModal">&times;</button>
          </div>
          <div id="modalBody" class="modal-body">
            <div v-if="modal.type === 'input'">
              <p v-html="modal.message"></p>
              <textarea
                v-if="modal.inputType === 'textarea'"
                class="modal-input modal-input--textarea"
                :placeholder="modal.placeholder"
                v-model="modal.inputValue"
                rows="4"
              ></textarea>
              <input
                v-else
                class="modal-input"
                :type="modal.inputType"
                :placeholder="modal.placeholder"
                v-model="modal.inputValue"
              />
            </div>
            <p v-else v-html="modal.message" :style="modal.isError ? 'color: var(--danger-primary)' : ''"></p>
          </div>
          <div id="modalFooter" class="modal-footer">
            <div style="display: flex; justify-content: flex-end; gap: 12px; width: 100%;">
              <button v-if="modal.showCancel" class="secondary" @click="handleCancel">
                {{ t("common.cancel") }}
              </button>
              <button :class="modal.type === 'confirm' ? 'danger' : ''" @click="handleConfirm">
                {{ modal.confirmLabel }}
              </button>
            </div>
          </div>
        </div>
      </div>
      <svg class="gooey-svg" aria-hidden="true">
        <filter id="gooey">
          <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="blur" />
          <feColorMatrix
            in="blur"
            mode="matrix"
            values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 16 -6"
            result="goo"
          />
          <feComposite in="SourceGraphic" in2="goo" operator="atop" />
        </filter>
      </svg>
    </div>
  </n-config-provider>
</template>

<script setup lang="ts">
import { computed, h, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import { useRoute, useRouter, RouterView } from "vue-router";
import {
  NLayout,
  NLayoutSider,
  NLayoutHeader,
  NLayoutContent,
  NMenu,
  NIcon,
  NButton,
  NSelect,
  NDrawer,
  NDrawerContent,
  NConfigProvider,
  darkTheme,
  zhCN,
  enUS,
  dateZhCN,
  dateEnUS,
  type MenuOption,
} from "naive-ui";
import { useAppStore } from "./stores/app";
import { apiJson } from "./services/api";
import { useI18n } from "./i18n";

const route = useRoute();
const router = useRouter();
const store = useAppStore();
const { t, locale, setLocale } = useI18n();
const selectedLocale = computed({
  get: () => locale.value,
  set: (value) => setLocale(value),
});

const isLogin = computed(() => route.name === "login");
const collapsed = ref(false);
const mobileNavOpen = ref(false);
const isMobile = ref(false);
const navRef = ref<HTMLElement | null>(null);
const navIndicator = ref<HTMLElement | null>(null);
const navIndicatorBlob = ref<HTMLElement | null>(null);

const localeOptions = computed(() => [
  { label: t("app.locale.zh-CN"), value: "zh-CN" },
  { label: t("app.locale.en-US"), value: "en-US" },
]);

const renderMenuIcon = (path: string) => () =>
  h(
    NIcon,
    null,
    {
      default: () =>
        h(
          "svg",
          { viewBox: "0 0 24 24", fill: "currentColor", width: "20", height: "20" },
          [h("path", { d: path })]
        ),
    }
  );

const iconLayout = "M4 4h7v7H4z M13 4h7v7h-7z M4 13h7v7H4z M13 13h7v7h-7z";
const iconWorkflow = "M6 4h12v4H6z M4 10h16v4H4z M6 16h12v4H6z";
const iconBot =
  "M12 2a4 4 0 00-4 4v2H6a4 4 0 000 8h2v2a4 4 0 008 0v-2h2a4 4 0 000-8h-2V6a4 4 0 00-4-4z";

const menuOptions = computed<MenuOption[]>(() => [
  { label: t("app.tabs.layout"), key: "buttons", icon: renderMenuIcon(iconLayout) },
  { label: t("app.tabs.workflow"), key: "workflow", icon: renderMenuIcon(iconWorkflow) },
  { label: t("app.tabs.bot"), key: "bot", icon: renderMenuIcon(iconBot) },
]);

const activeMenu = computed(() => (route.name as string) || "buttons");

const pageTitle = computed(() => {
  const active = menuOptions.value.find((opt) => opt.key === activeMenu.value);
  return (active?.label as string) || t("app.title");
});

const naiveTheme = darkTheme;
const naiveLocale = computed(() => (locale.value === "zh-CN" ? zhCN : enUS));
const naiveDateLocale = computed(() => (locale.value === "zh-CN" ? dateZhCN : dateEnUS));
const themeOverrides = {
  common: {
    primaryColor: "#00ff7f",
    primaryColorHover: "#2cff96",
    primaryColorPressed: "#00c96b",
    primaryColorSuppl: "#00ff7f",
    borderRadius: "10px",
    bodyColor: "#1a1d21",
    cardColor: "#2c313a",
    modalColor: "#2c313a",
    popoverColor: "#2c313a",
    borderColor: "#444c56",
    textColorBase: "#e1e1e1",
    textColor2: "#a0a0a0",
    inputColor: "#1a1d21",
  },
  Layout: {
    headerColor: "#2c313a",
    siderColor: "#2c313a",
  },
  Menu: {
    itemHeight: "44px",
    itemBorderRadius: "12px",
    itemTextColor: "#a0a0a0",
    itemTextColorHover: "#e1e1e1",
    itemTextColorActive: "#1a1d21",
    itemTextColorActiveHover: "#1a1d21",
    itemColorActive: "transparent",
    itemColorActiveHover: "transparent",
  },
};

const modal = reactive({
  visible: false,
  title: "",
  message: "",
  isError: false,
  type: "info" as "info" | "confirm" | "input",
  inputType: "text",
  placeholder: "",
  inputValue: "",
  confirmLabel: "",
  showCancel: false,
  onConfirm: null as null | ((value?: string) => void),
  onCancel: null as null | (() => void),
});

const openModal = (payload: Partial<typeof modal>) => {
  Object.assign(modal, {
    visible: true,
    title: payload.title ?? t("common.notice"),
    message: payload.message ?? "",
    isError: payload.isError ?? false,
    type: payload.type ?? "info",
    inputType: payload.inputType ?? "text",
    placeholder: payload.placeholder ?? "",
    inputValue: payload.inputValue ?? "",
    confirmLabel:
      payload.confirmLabel ?? (payload.type === "confirm" ? t("common.confirm") : t("common.ok")),
    showCancel: payload.showCancel ?? payload.type !== "info",
    onConfirm: payload.onConfirm ?? null,
    onCancel: payload.onCancel ?? null,
  });
};

const closeModal = () => {
  modal.visible = false;
};

const handleConfirm = () => {
  const value = modal.type === "input" ? modal.inputValue : undefined;
  const fn = modal.onConfirm;
  closeModal();
  if (fn) fn(value);
};

const handleCancel = () => {
  const fn = modal.onCancel;
  closeModal();
  if (fn) fn();
};

const refresh = async () => {
  await store.loadAll();
};

const saveAll = async () => {
  try {
    const editor = (window as any).tgButtonEditor;
    if (editor && typeof editor.saveCurrentWorkflow === "function") {
      await editor.saveCurrentWorkflow();
    }
    const workflows = await apiJson<Record<string, unknown>>("/api/workflows");
    store.state.workflows = workflows as any;
    await store.saveState();
    (window as any).showInfoModal?.(t("app.saveSuccess"));
  } catch (error: any) {
    (window as any).showInfoModal?.(t("app.saveFailed", { error: error.message || error }), true);
  }
};

const exportJson = () => {
  const blob = new Blob([JSON.stringify(store.state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "tg_button_config.json";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

const handleMenuUpdate = (key: string) => {
  mobileNavOpen.value = false;
  if (key === "buttons") {
    router.push({ name: "buttons" });
  } else if (key === "workflow") {
    router.push({ name: "workflow" });
  } else if (key === "bot") {
    router.push({ name: "bot" });
  }
};

const updateNavIndicator = async () => {
  if (isMobile.value) return;
  await nextTick();
  const nav = navRef.value;
  const indicator = navIndicator.value;
  const blob = navIndicatorBlob.value;
  if (!nav || !indicator || !blob) return;
  const active = nav.querySelector(".n-menu-item-content--selected") as HTMLElement | null;
  if (!active) return;
  const navRect = nav.getBoundingClientRect();
  const activeRect = active.getBoundingClientRect();
  const navStyle = window.getComputedStyle(nav);
  const paddingTop = Number.parseFloat(navStyle.paddingTop || "0");
  const top = activeRect.top - navRect.top - paddingTop;
  indicator.style.transform = `translateY(${Math.round(top)}px)`;
  indicator.style.height = `${Math.round(activeRect.height)}px`;
  const blobTop = top + activeRect.height / 2 - 11;
  blob.style.transform = `translateY(${Math.round(blobTop)}px)`;
};

const updateIsMobile = () => {
  if (typeof window === "undefined") return;
  isMobile.value = window.innerWidth <= 960;
  updateNavIndicator();
};

onMounted(() => {
  (window as any).showInfoModal = (message: string, isError = false) =>
    openModal({
      title: isError ? t("common.error") : t("common.notice"),
      message: message.replace(/\n/g, "<br>"),
      isError,
      type: "info",
    });

  (window as any).showConfirmModal = (
    title: string,
    message: string,
    onConfirm?: () => void,
    onCancel?: () => void
  ) =>
    openModal({
      title: title || t("common.confirm"),
      message: message.replace(/\n/g, "<br>"),
      type: "confirm",
      showCancel: true,
      confirmLabel: t("common.confirm"),
      onConfirm,
      onCancel,
    });

  (window as any).showInputModal = (
    title: string,
    message: string,
    inputType = "text",
    placeholder = "",
    onConfirm?: (value: string) => void,
    onCancel?: () => void
  ) =>
    openModal({
      title: title || t("common.confirm"),
      message: message.replace(/\n/g, "<br>"),
      type: "input",
      inputType,
      placeholder,
      showCancel: true,
      confirmLabel: t("common.confirm"),
      onConfirm,
      onCancel,
    });

  updateIsMobile();
  window.addEventListener("resize", updateIsMobile);

  if (!isLogin.value) {
    store.loadAll().catch(() => {
      if (route.name !== "login") {
        router.push({ name: "login" });
      }
    });
  }
});

onBeforeUnmount(() => {
  window.removeEventListener("resize", updateIsMobile);
});

watch(isLogin, (value) => {
  if (!value) {
    store.loadAll().catch(() => {
      if (route.name !== "login") {
        router.push({ name: "login" });
      }
    });
  }
});

watch(
  () => route.name,
  () => {
    mobileNavOpen.value = false;
    updateNavIndicator();
  }
);

watch(
  () => collapsed.value,
  () => updateNavIndicator()
);

watch(
  () => locale.value,
  () => updateNavIndicator()
);
</script>
