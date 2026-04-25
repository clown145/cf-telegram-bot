import { StateStore } from "./state-store";

export interface Env {
  STATE_STORE: DurableObjectNamespace;
  SKILLS_DB?: unknown;
  WEBUI_AUTH_TOKEN?: string;
  TELEGRAM_BOT_TOKEN?: string;
  OPENAI_API_KEY?: string;
  LLM_API_KEY?: string;
  OPENAI_BASE_URL?: string;
  OPENAI_DEFAULT_MODEL?: string;
  FILE_BUCKET?: unknown;
  ASSETS?: { fetch(request: Request): Promise<Response> };
}

const STORE_NAME = "global";

export { StateStore };

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/telegram/")) {
      const stub = env.STATE_STORE.get(env.STATE_STORE.idFromName(STORE_NAME));
      try {
        return await stub.fetch(request);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return new Response(JSON.stringify({ error: "state store request failed", detail: message }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    if (env.ASSETS) {
      const isAsset = url.pathname.includes(".");
      if (!isAsset) {
        url.pathname = "/index.html";
      }
      const assetRequest = new Request(url.toString(), request);
      return env.ASSETS.fetch(assetRequest);
    }

    return new Response("Not found", { status: 404 });
  },
};
