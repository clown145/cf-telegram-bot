import { createRouter, createWebHistory } from "vue-router";
import { apiFetch } from "./services/api";
import { getAuthToken } from "./services/auth";

const routes = [
  { path: "/login", name: "login", component: () => import("./views/LoginView.vue"), meta: { public: true } },
  { path: "/", name: "buttons", component: () => import("./views/ButtonsView.vue") },
  { path: "/workflow", name: "workflow", component: () => import("./views/WorkflowView.vue") },
  { path: "/bot", name: "bot", component: () => import("./views/BotView.vue") },
  { path: "/llm", name: "llm", component: () => import("./views/LlmView.vue") },
  { path: "/mcp", name: "mcp", component: () => import("./views/McpView.vue") },
  { path: "/skills", name: "skills", component: () => import("./views/SkillsView.vue") },
  { path: "/agent", name: "agent", component: () => import("./views/AgentView.vue") },
  { path: "/agent-sessions", name: "agentSessions", component: () => import("./views/AgentSessionsView.vue") },
  { path: "/agent-tasks", name: "agentTasks", component: () => import("./views/AgentTasksView.vue") },
  { path: "/logs", name: "logs", component: () => import("./views/LogsView.vue") },
];

export const router = createRouter({
  history: createWebHistory(),
  routes,
});

router.beforeEach((to) => {
  if (to.meta.public) return true;
  if (!getAuthToken()) {
    return apiFetch("/api/health")
      .then((response) => {
        if (response.ok) {
          return true;
        }
        return { name: "login" };
      })
      .catch(() => ({ name: "login" }));
  }
  return true;
});
