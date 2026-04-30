import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiFetch, apiJson, setUnauthorizedHandler } from "./api";

const originalFetch = globalThis.fetch;

describe("api service", () => {
  beforeEach(() => {
    localStorage.clear();
    setUnauthorizedHandler(null);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
    setUnauthorizedHandler(null);
  });

  it("adds auth token header to requests", async () => {
    localStorage.setItem("tg-button-auth-token", "secret-token");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
    globalThis.fetch = fetchMock as typeof fetch;

    await apiFetch("/api/state");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = new Headers(options.headers);
    expect(headers.get("X-Auth-Token")).toBe("secret-token");
    expect(headers.get("Content-Type")).toBe("application/json");
  });

  it("clears auth token and notifies unauthorized handler on 401", async () => {
    localStorage.setItem("tg-button-auth-token", "expired-token");
    const unauthorizedHandler = vi.fn().mockResolvedValue(undefined);
    setUnauthorizedHandler(unauthorizedHandler);
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(null, { status: 401 })) as typeof fetch;

    await expect(apiFetch("/api/state")).rejects.toMatchObject({
      name: "ApiError",
      status: 401,
      code: "unauthorized",
    });
    expect(localStorage.getItem("tg-button-auth-token")).toBeNull();
    expect(unauthorizedHandler).toHaveBeenCalledTimes(1);
  });

  it("throws ApiError with parsed payload details", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "auth_not_configured", detail: "Token missing" }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      })
    ) as typeof fetch;

    let caught: unknown;
    try {
      await apiJson("/api/state");
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ApiError);
    expect(caught).toMatchObject({
      message: "auth_not_configured",
      status: 503,
      details: {
        detail: "Token missing",
        error: "auth_not_configured",
      },
    });
  });
});
