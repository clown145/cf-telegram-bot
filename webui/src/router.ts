import { createRouter, createWebHistory } from "vue-router";
import ButtonsView from "./views/ButtonsView.vue";
import WorkflowView from "./views/WorkflowView.vue";
import BotView from "./views/BotView.vue";
import LogsView from "./views/LogsView.vue";
import LoginView from "./views/LoginView.vue";
import { getAuthToken } from "./services/auth";

const routes = [
  { path: "/login", name: "login", component: LoginView, meta: { public: true } },
  { path: "/", name: "buttons", component: ButtonsView },
  { path: "/workflow", name: "workflow", component: WorkflowView },
  { path: "/bot", name: "bot", component: BotView },
  { path: "/logs", name: "logs", component: LogsView },
];

export const router = createRouter({
  history: createWebHistory(),
  routes,
});

router.beforeEach((to) => {
  if (to.meta.public) return true;
  if (!getAuthToken()) {
    return { name: "login" };
  }
  return true;
});
