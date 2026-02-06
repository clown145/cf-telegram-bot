import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import { router } from "./router";
import { setUnauthorizedHandler } from "./services/api";
import "./styles/base.css";
import "./styles/drawflow.css";
import "./styles/components/sidebar.css";

setUnauthorizedHandler(async () => {
  if (router.currentRoute.value.name !== "login") {
    await router.push({ name: "login" });
  }
});

const app = createApp(App);
app.use(createPinia());
app.use(router);
app.mount("#app");
