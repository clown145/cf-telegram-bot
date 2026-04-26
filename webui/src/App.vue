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
              <n-space size="small" :wrap-item="true">
                <n-button secondary @click="exportJson">{{ t("toolbar.export") }}</n-button>
                <n-button secondary @click="toggleLocale">
                  {{ localeToggleLabel }}
                </n-button>
              </n-space>
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

      <n-drawer v-if="isMobile && !isLogin" v-model:show="mobileNavOpen" placement="left" :width="mobileDrawerWidth">
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
import { computed, h, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute, useRouter, RouterView } from "vue-router";
import {
  NLayout,
  NLayoutSider,
  NLayoutHeader,
  NLayoutContent,
  NMenu,
  NIcon,
  NButton,
  NSpace,
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
import { useI18n } from "./i18n";

const route = useRoute();
const router = useRouter();
const store = useAppStore();
const { t, locale, setLocale } = useI18n();

const isLogin = computed(() => route.name === "login");
const collapsed = ref(localStorage.getItem("sidebar-collapsed") === "true");
const mobileNavOpen = ref(false);
const isMobile = ref(false);
const mobileDrawerWidth = ref<number>(260);
const navRef = ref<HTMLElement | null>(null);
const navIndicator = ref<HTMLElement | null>(null);

const localeToggleLabel = computed(() => (locale.value === "zh-CN" ? "English" : "中文"));

const toggleLocale = () => {
  const next = locale.value === "zh-CN" ? "en-US" : "zh-CN";
  setLocale(next);
};

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
const iconLlm =
  "M12 3l2.2 4.8L19 10l-4.8 2.2L12 17l-2.2-4.8L5 10l4.8-2.2z M6 15l1 2 2 1-2 1-1 2-1-2-2-1 2-1z";
const iconSkills =
  "M4 5a2 2 0 012-2h4l2 2h6a2 2 0 012 2v3H4z M4 12h7v7H6a2 2 0 01-2-2z M13 12h7v5a2 2 0 01-2 2h-5z";
const iconAgent =
  "M12 2a6 6 0 00-6 6v2.2A3 3 0 004 13v3a3 3 0 003 3h1v-7H7a1 1 0 01-1-1V8a6 6 0 1112 0v3a1 1 0 01-1 1h-1v7h1a3 3 0 003-3v-3a3 3 0 00-2-2.8V8a6 6 0 00-6-6z M9 8h2v2H9z M13 8h2v2h-2z M9 14h6v2H9z";
const iconAgentSessions =
  "M4 4h16v4H4z M4 10h10v4H4z M4 16h16v4H4z M16 10h4v4h-4z";
const iconLogs = "M4 6h16v2H4z M4 11h16v2H4z M4 16h16v2H4z";

const menuOptions = computed<MenuOption[]>(() => [
  { label: t("app.tabs.layout"), key: "buttons", icon: renderMenuIcon(iconLayout) },
  { label: t("app.tabs.workflow"), key: "workflow", icon: renderMenuIcon(iconWorkflow) },
  { label: t("app.tabs.bot"), key: "bot", icon: renderMenuIcon(iconBot) },
  { label: t("app.tabs.llm"), key: "llm", icon: renderMenuIcon(iconLlm) },
  { label: t("app.tabs.skills"), key: "skills", icon: renderMenuIcon(iconSkills) },
  { label: t("app.tabs.agent"), key: "agent", icon: renderMenuIcon(iconAgent) },
  { label: t("app.tabs.agentSessions"), key: "agentSessions", icon: renderMenuIcon(iconAgentSessions) },
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
  } else if (key === "llm") {
    router.push({ name: "llm" });
  } else if (key === "skills") {
    router.push({ name: "skills" });
  } else if (key === "agent") {
    router.push({ name: "agent" });
  } else if (key === "agentSessions") {
    router.push({ name: "agentSessions" });
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
  mobileDrawerWidth.value = Math.max(220, Math.min(320, window.innerWidth - 24));
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
    if (
      lastTab &&
      lastTab !== "buttons" &&
      ["workflow", "bot", "llm", "skills", "agent", "agentSessions", "logs"].includes(lastTab)
    ) {
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
