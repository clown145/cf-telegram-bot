<template>
  <div class="login-page">
    <div class="login-card">
      <h2>{{ t("login.title") }}</h2>
      <p class="muted">{{ t("login.subtitle") }}</p>
      <input v-model="token" type="password" :placeholder="t('login.placeholder')" />
      <button @click="submit" :disabled="loading">{{ loading ? t("login.submitting") : t("login.submit") }}</button>
      <p v-if="error" class="muted" style="color: var(--danger-primary)">{{ error }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import { apiFetch } from "../services/api";
import { setAuthToken } from "../services/auth";
import { useI18n } from "../i18n";

const token = ref("");
const loading = ref(false);
const error = ref("");
const router = useRouter();
const { t } = useI18n();

const submit = async () => {
  error.value = "";
  if (!token.value.trim()) {
    error.value = t("login.emptyToken");
    return;
  }
  loading.value = true;
  try {
    setAuthToken(token.value.trim());
    const response = await apiFetch("/api/health");
    if (!response.ok) {
      throw new Error(t("login.authFailed"));
    }
    await router.push({ name: "buttons" });
  } catch (err: any) {
    error.value = err?.message || t("login.authFailed");
  } finally {
    loading.value = false;
  }
};
</script>

<style scoped>
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--background);
}

.login-card {
  width: min(360px, 90vw);
  background: var(--surface-color);
  padding: 32px;
  border-radius: 16px;
  border: 1px solid var(--border-color);
  display: grid;
  gap: 12px;
}

.login-card input {
  width: 100%;
}

.login-card button {
  width: 100%;
}
</style>