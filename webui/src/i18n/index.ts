import { ref } from "vue";
import zhCN from "./zh-CN";
import enUS from "./en-US";

export type LocaleKey = "zh-CN" | "en-US";
export type MessageDict = Record<string, string | MessageDict>;

const messages: Record<LocaleKey, MessageDict> = {
  "zh-CN": zhCN,
  "en-US": enUS,
};

const STORAGE_KEY = "tg-button-locale";

const resolveLocale = (): LocaleKey => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY) as LocaleKey | null;
    if (stored && messages[stored]) {
      return stored;
    }
  } catch {
    // ignore
  }
  return "zh-CN";
};

const locale = ref<LocaleKey>(resolveLocale());

export const setLocale = (next: LocaleKey) => {
  if (!messages[next]) return;
  locale.value = next;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // ignore
  }
};

export const getLocale = () => locale.value;

const resolvePath = (dict: MessageDict, key: string): string | MessageDict | undefined => {
  return key.split(".").reduce<any>((acc, part) => {
    if (!acc || typeof acc !== "object") return undefined;
    return acc[part];
  }, dict);
};

const interpolate = (text: string, vars?: Record<string, string | number>) => {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (_, key) => {
    const value = vars[key];
    return value === undefined || value === null ? "" : String(value);
  });
};

export const t = (key: string, vars?: Record<string, string | number>): string => {
  const dict = messages[locale.value] || messages["zh-CN"];
  const resolved = resolvePath(dict, key);
  if (typeof resolved === "string") {
    return interpolate(resolved, vars);
  }
  return key;
};

export const useI18n = () => ({
  t,
  locale,
  setLocale,
  messages,
});