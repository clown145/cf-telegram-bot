import { generateId, jsonResponse, parseJson } from "../utils";
import {
  defaultBaseUrlForProvider,
  listProviderModels,
  LLM_PROVIDER_TYPES,
  type LlmModelConfig,
  type LlmProviderConfig,
  type LlmProviderType,
  type LlmRuntimeConfig,
} from "../agents/llmClient";

export type LlmConfig = LlmRuntimeConfig;

export interface DurableObjectStorage {
  get<T>(key: string): Promise<T | undefined>;
  put(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<boolean> | Promise<void>;
}

export class LlmConfigService {
  private storage: DurableObjectStorage;

  constructor(storage: DurableObjectStorage) {
    this.storage = storage;
  }

  normalizeLlmProviderType(input: unknown): LlmProviderType {
    const type = String(input || "openai").trim().toLowerCase();
    return (LLM_PROVIDER_TYPES as readonly string[]).includes(type) ? (type as LlmProviderType) : "openai";
  }

  buildLlmModelId(providerId: string, model: string): string {
    return `${providerId}:${encodeURIComponent(model)}`;
  }

  async loadLlmConfig(): Promise<LlmConfig> {
    const stored = await this.storage.get<Partial<LlmConfig>>("llm_config");
    const rawProviders =
      stored?.providers && typeof stored.providers === "object" && !Array.isArray(stored.providers)
        ? stored.providers
        : {};
    const rawModels =
      stored?.models && typeof stored.models === "object" && !Array.isArray(stored.models)
        ? stored.models
        : {};

    const providers: Record<string, LlmProviderConfig> = {};
    for (const [rawId, rawProvider] of Object.entries(rawProviders)) {
      const provider = rawProvider && typeof rawProvider === "object" ? (rawProvider as Partial<LlmProviderConfig>) : {};
      const id = String(provider.id || rawId || "").trim();
      if (!id) {
        continue;
      }
      const type = this.normalizeLlmProviderType(provider.type);
      providers[id] = {
        id,
        name: String(provider.name || id).trim() || id,
        type,
        base_url: String(provider.base_url || defaultBaseUrlForProvider(type)).trim() || defaultBaseUrlForProvider(type),
        api_key: String(provider.api_key || ""),
        enabled: provider.enabled !== false,
        created_at: Number(provider.created_at || Date.now()),
        updated_at: Number(provider.updated_at || Date.now()),
      };
    }

    const models: Record<string, LlmModelConfig> = {};
    for (const [rawId, rawModel] of Object.entries(rawModels)) {
      const model = rawModel && typeof rawModel === "object" ? (rawModel as Partial<LlmModelConfig>) : {};
      const providerId = String(model.provider_id || "").trim();
      const modelName = String(model.model || "").trim();
      if (!providerId || !providers[providerId] || !modelName) {
        continue;
      }
      if (model.enabled !== true) {
        continue;
      }
      const id = String(model.id || rawId || this.buildLlmModelId(providerId, modelName)).trim();
      models[id] = {
        id,
        provider_id: providerId,
        model: modelName,
        name: String(model.name || modelName).trim() || modelName,
        enabled: true,
        created_at: Number(model.created_at || Date.now()),
        updated_at: Number(model.updated_at || Date.now()),
      };
    }

    return { providers, models };
  }

  async saveLlmConfig(config: LlmConfig): Promise<void> {
    const models = Object.fromEntries(
      Object.entries(config.models || {}).filter(([, model]) => model.enabled === true)
    );
    await this.storage.put("llm_config", { ...config, models });
  }

  publicLlmConfig(config: LlmConfig) {
    const providers = Object.fromEntries(
      Object.entries(config.providers).map(([id, provider]) => [
        id,
        {
          id: provider.id,
          name: provider.name,
          type: provider.type,
          base_url: provider.base_url,
          api_key: "",
          enabled: provider.enabled,
          has_api_key: Boolean(String(provider.api_key || "").trim()),
          created_at: provider.created_at || null,
          updated_at: provider.updated_at || null,
        },
      ])
    );
    return {
      providers,
      models: config.models,
      provider_types: LLM_PROVIDER_TYPES,
      default_base_urls: {
        openai: defaultBaseUrlForProvider("openai"),
        gemini: defaultBaseUrlForProvider("gemini"),
      },
    };
  }

  async handleLlmConfigGet(): Promise<Response> {
    return jsonResponse(this.publicLlmConfig(await this.loadLlmConfig()));
  }

  async handleLlmProviderUpsert(request: Request): Promise<Response> {
    let payload: Record<string, unknown>;
    try {
      payload = await parseJson<Record<string, unknown>>(request);
    } catch (error) {
      return jsonResponse({ error: `invalid body: ${String(error)}` }, 400);
    }

    const config = await this.loadLlmConfig();
    const id = String(payload.id || "").trim() || generateId("llm");
    const existing = config.providers[id];
    const type = this.normalizeLlmProviderType(payload.type || existing?.type);
    const now = Date.now();
    const name = String(payload.name || existing?.name || `${type} provider`).trim();
    const rawBaseUrl = typeof payload.base_url === "string" ? payload.base_url.trim() : "";
    const baseUrl =
      rawBaseUrl || (existing && existing.type === type ? existing.base_url : defaultBaseUrlForProvider(type));
    const apiKeyInput = typeof payload.api_key === "string" ? payload.api_key.trim() : "";

    config.providers[id] = {
      id,
      name: name || id,
      type,
      base_url: baseUrl,
      api_key: apiKeyInput || existing?.api_key || "",
      enabled: payload.enabled !== false,
      created_at: existing?.created_at || now,
      updated_at: now,
    };

    await this.saveLlmConfig(config);
    return jsonResponse({ status: "ok", provider_id: id, config: this.publicLlmConfig(config) });
  }

  async handleLlmProviderDelete(providerId: string): Promise<Response> {
    const config = await this.loadLlmConfig();
    if (!config.providers[providerId]) {
      return jsonResponse({ error: `provider not found: ${providerId}` }, 404);
    }
    delete config.providers[providerId];
    for (const [modelId, model] of Object.entries(config.models)) {
      if (model.provider_id === providerId) {
        delete config.models[modelId];
      }
    }
    await this.saveLlmConfig(config);
    return jsonResponse({ status: "ok", deleted_id: providerId, config: this.publicLlmConfig(config) });
  }

  async handleLlmProviderFetchModels(providerId: string): Promise<Response> {
    const config = await this.loadLlmConfig();
    const provider = config.providers[providerId];
    if (!provider) {
      return jsonResponse({ error: `provider not found: ${providerId}` }, 404);
    }
    try {
      const remoteModels = await listProviderModels(provider);
      const now = Date.now();
      const fetchedModels = remoteModels.map((remoteModel) => {
        const id = this.buildLlmModelId(providerId, remoteModel.model);
        const existing = config.models[id];
        const model: LlmModelConfig = {
          id,
          provider_id: providerId,
          model: remoteModel.model,
          name: existing?.name || remoteModel.name || remoteModel.model,
          enabled: existing?.enabled === true,
          created_at: existing?.created_at || now,
          updated_at: now,
        };
        if (model.enabled) {
          config.models[id] = model;
        }
        return model;
      });
      await this.saveLlmConfig(config);
      return jsonResponse({
        status: "ok",
        provider_id: providerId,
        fetched: remoteModels.length,
        models: fetchedModels,
        config: this.publicLlmConfig(config),
      });
    } catch (error) {
      return jsonResponse({ error: `fetch models failed: ${String(error)}` }, 500);
    }
  }

  async handleLlmModelsUpdate(request: Request): Promise<Response> {
    let payload: Record<string, unknown>;
    try {
      payload = await parseJson<Record<string, unknown>>(request);
    } catch (error) {
      return jsonResponse({ error: `invalid body: ${String(error)}` }, 400);
    }

    const entries = Array.isArray(payload.models) ? payload.models : [];
    const config = await this.loadLlmConfig();
    const now = Date.now();
    let updated = 0;
    for (const entry of entries) {
      const item = entry && typeof entry === "object" ? (entry as Record<string, unknown>) : {};
      const existingId = String(item.id || "").trim();
      const existing = existingId ? config.models[existingId] : undefined;
      const providerId = String(item.provider_id || existing?.provider_id || "").trim();
      const modelName = String(item.model || existing?.model || "").trim();
      const id = existingId || (providerId && modelName ? this.buildLlmModelId(providerId, modelName) : "");
      if (!id) {
        continue;
      }
      if (item.enabled !== true) {
        delete config.models[id];
        updated += 1;
        continue;
      }
      if (!providerId || !config.providers[providerId] || !modelName) {
        continue;
      }
      config.models[id] = {
        id,
        provider_id: providerId,
        model: modelName,
        name: typeof item.name === "string" && item.name.trim() ? item.name.trim() : existing?.name || modelName,
        enabled: true,
        created_at: existing?.created_at || now,
        updated_at: now,
      };
      updated += 1;
    }
    await this.saveLlmConfig(config);
    return jsonResponse({ status: "ok", updated, config: this.publicLlmConfig(config) });
  }
}
