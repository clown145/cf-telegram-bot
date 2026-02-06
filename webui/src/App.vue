<template>
  <n-config-provider
    :theme="naiveTheme"
    :locale="naiveLocale"
    :date-locale="naiveDateLocale"
    :theme-overrides="themeOverrides"
  >
    <n-dialog-provider>
      <n-message-provider>
        <GlobalUIBridge />
        <div class="app-shell">
      <n-layout v-if="!isLogin" class="app-layout" :has-sider="!isMobile">
        <n-layout-sider
          v-if="!isMobile"
          v-model:collapsed="collapsed"
          class="app-sider"
          :width="240"
          :collapsed-width="72"
          collapse-mode="width"
          :show-trigger="false"
          bordered
        >
          <!-- Custom Toggle Button (Matches Workflow/Button Bank style) -->
          <button 
             class="sidebar-toggle-btn"
             :class="{ collapsed }"
             @click="collapsed = !collapsed"
             :title="collapsed ? t('app.expand') : t('app.collapse')"
          >
             <span class="caret-icon"></span>
          </button>

          <div class="app-sider-header" :class="{ collapsed }">
             <!-- Title/Subtitle removed to save space for toggle button -->
          </div>
          <div class="app-nav" ref="navRef">
            <div class="nav-indicator-layer">
              <div ref="navIndicator" class="nav-indicator"></div>
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
            <RouterView v-slot="{ Component }">
              <transition name="page" mode="out-in">
                <component :is="Component" />
              </transition>
            </RouterView>
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
    </div>

      </n-message-provider>
    </n-dialog-provider>
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
  NMessageProvider,
  NDialogProvider,
  darkTheme,
  zhCN,
  enUS,
  dateZhCN,
  dateEnUS,
  type MenuOption,
} from "naive-ui";
import GlobalUIBridge from "./components/GlobalUIBridge.vue";
import { useAppStore } from "./stores/app";
import { apiJson } from "./services/api";
import { getEditorBridge } from "./services/editorBridge";
import { showInfoModal } from "./services/uiBridge";
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
const collapsed = ref(localStorage.getItem("sidebar-collapsed") === "true");
const mobileNavOpen = ref(false);
const isMobile = ref(false);
const navRef = ref<HTMLElement | null>(null);
const navIndicator = ref<HTMLElement | null>(null);

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
const iconLogs = "M4 6h16v2H4z M4 11h16v2H4z M4 16h16v2H4z";

const menuOptions = computed<MenuOption[]>(() => [
  { label: t("app.tabs.layout"), key: "buttons", icon: renderMenuIcon(iconLayout) },
  { label: t("app.tabs.workflow"), key: "workflow", icon: renderMenuIcon(iconWorkflow) },
  { label: t("app.tabs.bot"), key: "bot", icon: renderMenuIcon(iconBot) },
  { label: t("app.tabs.logs"), key: "logs", icon: renderMenuIcon(iconLogs) },
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

const refresh = async () => {
  await store.loadAll();
};

const saveAll = async () => {
  try {
    const editor = getEditorBridge();
    if (editor && typeof editor.saveCurrentWorkflow === "function") {
      await editor.saveCurrentWorkflow();
    }
    const workflows = await apiJson<Record<string, unknown>>("/api/workflows");
    store.state.workflows = workflows as any;
    await store.saveState();
    showInfoModal(t("app.saveSuccess"));
  } catch (error: any) {
    showInfoModal(t("app.saveFailed", { error: error.message || error }), true);
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
  } else if (key === "logs") {
    router.push({ name: "logs" });
  }
};

const updateNavIndicator = async () => {
  if (isMobile.value) return;
  await nextTick();
  const nav = navRef.value;
  const indicator = navIndicator.value;
  if (!nav || !indicator) return;
  const active = nav.querySelector(".n-menu-item-content--selected") as HTMLElement | null;
  if (!active) return;
  const navRect = nav.getBoundingClientRect();
  const activeRect = active.getBoundingClientRect();
  const navStyle = window.getComputedStyle(nav);
  /* The indicator layer is inset: 0 relative to app-nav's border box logic.
     Absolute children are positioned relative to the padding box corner (0,0).
     The menu content starts after padding.
     activeRect.top - navRect.top gives the offset from the top edge.
     We should NOT subtract padding if we want to position relative to the top edge. 
  */
  const top = activeRect.top - navRect.top;
  indicator.style.transform = `translateY(${Math.round(top)}px)`;
  indicator.style.height = `${Math.round(activeRect.height)}px`;
};

const updateIsMobile = () => {
  if (typeof window === "undefined") return;
  isMobile.value = window.innerWidth <= 960;
  updateNavIndicator();
};

onMounted(async () => {
  updateIsMobile();
  window.addEventListener("resize", updateIsMobile);

  await router.isReady();
  
  // Restore last active tab if at root
  if (route.name === "buttons") {
    const lastTab = localStorage.getItem("config-last-tab");
    if (lastTab && lastTab !== "buttons" && ["workflow", "bot", "logs"].includes(lastTab)) {
      router.replace({ name: lastTab });
    }
  }

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
  (newValue) => {
    mobileNavOpen.value = false;
    updateNavIndicator();
    if (newValue && typeof newValue === "string" && newValue !== "login") {
        localStorage.setItem("config-last-tab", newValue);
    }
  }
);

watch(
  () => collapsed.value,
  (value) => {
    localStorage.setItem("sidebar-collapsed", value ? "true" : "false");
    updateNavIndicator();
  }
);

watch(
  () => locale.value,
  () => updateNavIndicator()
);
</script>
