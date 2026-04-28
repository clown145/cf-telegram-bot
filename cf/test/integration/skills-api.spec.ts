import { StateStore } from "../../src/state-store";
import { defaultState } from "../../src/utils";
import { MockDurableObjectState } from "../helpers/mock-do";

interface ApiCallOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
}

class MockD1PreparedStatement {
  constructor(
    private db: MockD1Database,
    private sql: string,
    private args: unknown[] = []
  ) {}

  bind(...values: unknown[]) {
    return new MockD1PreparedStatement(this.db, this.sql, values);
  }

  async all<T>() {
    return { results: this.db.all(this.sql, this.args) as T[] };
  }

  async first<T>() {
    return (this.db.first(this.sql, this.args) as T) || null;
  }

  async run() {
    this.db.run(this.sql, this.args);
    return { success: true };
  }
}

class MockD1Database {
  packs = new Map<string, Record<string, any>>();
  files = new Map<string, Record<string, any>>();
  execCalls: string[] = [];

  async exec(sql: string) {
    this.execCalls.push(sql);
    return { success: true };
  }

  prepare(sql: string) {
    return new MockD1PreparedStatement(this, sql);
  }

  all(sql: string, _args: unknown[]) {
    const normalized = sql.replace(/\s+/g, " ").trim().toLowerCase();
    if (normalized.startsWith("select key, label")) {
      return Array.from(this.packs.values())
        .sort((a, b) => String(a.key).localeCompare(String(b.key)))
        .map((pack) => ({ ...pack }));
    }
    if (normalized.startsWith("select path, skill_key")) {
      return Array.from(this.files.values())
        .filter((file) => file.namespace === "custom")
        .sort((a, b) => String(a.path).localeCompare(String(b.path)))
        .map((file) => ({ ...file }));
    }
    if (normalized.startsWith("select key from skill_packs")) {
      return Array.from(this.packs.keys()).map((key) => ({ key }));
    }
    return [];
  }

  first(sql: string, _args: unknown[]) {
    const normalized = sql.replace(/\s+/g, " ").trim().toLowerCase();
    if (normalized.startsWith("select count(*) as count from skill_packs")) {
      return { count: this.packs.size };
    }
    return null;
  }

  run(sql: string, args: unknown[]) {
    const normalized = sql.replace(/\s+/g, " ").trim().toLowerCase();
    if (normalized.startsWith("insert into skill_packs")) {
      const [key, label, category, description, toolIdsJson, rootPath, filename, createdAt, updatedAt] = args;
      this.packs.set(String(key), {
        key,
        label,
        category,
        description,
        tool_ids_json: toolIdsJson,
        root_path: rootPath,
        filename,
        created_at: createdAt,
        updated_at: updatedAt,
      });
      return;
    }
    if (normalized.startsWith("insert into skill_files")) {
      const [path, skillKey, namespace, content, contentType, createdAt, updatedAt] = args;
      this.files.set(String(path), {
        path,
        skill_key: skillKey,
        namespace,
        content,
        content_type: contentType,
        created_at: createdAt,
        updated_at: updatedAt,
      });
      return;
    }
    if (normalized.startsWith("delete from skill_files")) {
      const [skillKey] = args;
      for (const [path, file] of this.files.entries()) {
        if (file.skill_key === skillKey && file.namespace === "custom") {
          this.files.delete(path);
        }
      }
      return;
    }
    if (normalized.startsWith("delete from skill_packs")) {
      this.packs.delete(String(args[0]));
    }
  }
}

function createStore(envOverrides: Record<string, unknown> = {}) {
  const state = new MockDurableObjectState();
  const env = {
    WEBUI_AUTH_TOKEN: "",
    TELEGRAM_BOT_TOKEN: "test_token",
    ...envOverrides,
  };
  const store = new StateStore(state as any, env as any);
  return { state, store };
}

async function callApi(store: StateStore, path: string, options: ApiCallOptions = {}): Promise<Response> {
  const headers = new Headers(options.headers || {});
  if (options.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return await store.fetch(
    new Request(`https://example.com${path}`, {
      method: options.method || "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    })
  );
}

describe("skills api", () => {
  it("lists generated skill packs", async () => {
    const { state, store } = createStore();
    await state.storage.put("state", defaultState("Root"));

    const res = await callApi(store, "/api/actions/skills/available");
    const body = (await res.json()) as any;

    expect(res.status).toBe(200);
    expect(body.categories.some((category: any) => category.key === "ai")).toBe(true);
    const generatedPacks = body.skill_packs.filter((pack: any) => pack.source === "generated");
    expect(generatedPacks).toHaveLength(2);
    const rootPack = generatedPacks.find((pack: any) => pack.key === "workflow-nodes");
    expect(rootPack.key).toBe("workflow-nodes");
    expect(rootPack.custom).toBeUndefined();
    expect(rootPack.content_md).toContain("# Workflow Node Tools");
    expect(rootPack.content_md).toContain("## Read Order");
    expect(rootPack.content_md).toContain("It does not contain every tool schema in this file");
    expect(rootPack.virtual_folders.some((folder: any) => folder.category === "ai")).toBe(true);
    expect(rootPack.files.some((file: any) => file.path === "workflow-nodes/ai/SKILL.md")).toBe(true);
    expect(rootPack.files.some((file: any) => file.path === "workflow-nodes/ai/llm_generate.md")).toBe(true);
    const llmDoc = rootPack.files.find((file: any) => file.path === "workflow-nodes/ai/llm_generate.md");
    expect(llmDoc.content_md).toContain("## Input Schema");
    expect(rootPack.tools.some((tool: any) => tool.id === "llm_generate")).toBe(true);
    const workflowPack = generatedPacks.find((pack: any) => pack.key === "workflows");
    expect(workflowPack.content_md).toContain("# Saved Workflows");
    expect(workflowPack.files.some((file: any) => file.path === "workflows/tools/list_workflows.md")).toBe(true);
  });

  it("uploads and deletes markdown skill documents that reference existing nodes", async () => {
    const { state, store } = createStore();
    await state.storage.put("state", defaultState("Root"));

    const uploadRes = await callApi(store, "/api/actions/skills/upload", {
      method: "POST",
      body: {
        filename: "message_ai_compose.md",
        content_md: [
          "---",
          "key: message_ai_compose",
          "label: Message AI Compose",
          "category: ai",
          "tool_ids:",
          "  - llm_generate",
          "  - send_message",
          "  - edit_message_text",
          "---",
          "",
          "# Message AI Compose",
          "",
          "Expose message and LLM tools together.",
        ].join("\n"),
      },
    });
    const uploaded = (await uploadRes.json()) as any;

    expect(uploadRes.status).toBe(200);
    const customPack = uploaded.skill_packs.find((pack: any) => pack.key === "message_ai_compose");
    expect(customPack.custom).toBe(true);
    expect(customPack.source).toBe("uploaded");
    expect(customPack.content_md).toContain("# Message AI Compose");
    expect(customPack.filename).toBe("message_ai_compose.md");
    expect(customPack.tools.map((tool: any) => tool.id)).toEqual([
      "llm_generate",
      "send_message",
      "edit_message_text",
    ]);

    const reloadRes = await callApi(store, "/api/actions/skills/available");
    const reloaded = (await reloadRes.json()) as any;
    expect(reloaded.skill_packs.some((pack: any) => pack.key === "message_ai_compose")).toBe(true);

    const deleteRes = await callApi(store, "/api/actions/skills/message_ai_compose", {
      method: "DELETE",
    });
    const deleted = (await deleteRes.json()) as any;

    expect(deleteRes.status).toBe(200);
    expect(deleted.skill_packs.some((pack: any) => pack.key === "message_ai_compose")).toBe(false);
  });

  it("uploads multi-file skill packages and exposes them through the VFS", async () => {
    const { state, store } = createStore();
    await state.storage.put("state", defaultState("Root"));

    const uploadRes = await callApi(store, "/api/actions/skills/upload", {
      method: "POST",
      body: {
        key: "message_ai_bundle",
        label: "Message AI Bundle",
        category: "ai",
        tool_ids: ["llm_generate", "send_message"],
        files: [
          {
            path: "SKILL.md",
            content_md: [
              "---",
              "key: message_ai_bundle",
              "label: Message AI Bundle",
              "category: ai",
              "tool_ids:",
              "  - llm_generate",
              "  - send_message",
              "---",
              "",
              "# Message AI Bundle",
              "",
              "Read `references/prompting.md` before composing text.",
            ].join("\n"),
          },
          {
            path: "references/prompting.md",
            title: "Prompting Notes",
            content_md: "# Prompting Notes\n\nKeep Telegram messages concise.",
          },
        ],
      },
    });
    const uploaded = (await uploadRes.json()) as any;

    expect(uploadRes.status).toBe(200);
    const pack = uploaded.skill_packs.find((item: any) => item.key === "message_ai_bundle");
    expect(pack.files.map((file: any) => file.path)).toContain("custom/message_ai_bundle/SKILL.md");
    expect(pack.files.map((file: any) => file.path)).toContain("custom/message_ai_bundle/references/prompting.md");

    const listRes = await callApi(
      store,
      "/api/vfs/list?path=skills%3A%2F%2Fcustom%2Fmessage_ai_bundle&recursive=1&depth=3"
    );
    const list = (await listRes.json()) as any;
    expect(listRes.status).toBe(200);
    expect(list.entries.some((entry: any) => entry.path === "skills://custom/message_ai_bundle/SKILL.md")).toBe(true);
    expect(list.entries.some((entry: any) => entry.path === "skills://custom/message_ai_bundle/references")).toBe(true);

    const fileRes = await callApi(
      store,
      "/api/vfs/file?path=skills%3A%2F%2Fcustom%2Fmessage_ai_bundle%2Freferences%2Fprompting.md"
    );
    const file = (await fileRes.json()) as any;
    expect(fileRes.status).toBe(200);
    expect(file.file.content_md).toContain("Keep Telegram messages concise");

    const searchRes = await callApi(store, "/api/vfs/search?query=concise&path=skills%3A%2F%2Fcustom");
    const search = (await searchRes.json()) as any;
    expect(searchRes.status).toBe(200);
    expect(search.matches[0].path).toBe("skills://custom/message_ai_bundle/references/prompting.md");
  });

  it("rejects uploaded skill packs that reference unknown node ids", async () => {
    const { state, store } = createStore();
    await state.storage.put("state", defaultState("Root"));

    const res = await callApi(store, "/api/actions/skills/upload", {
      method: "POST",
      body: {
        key: "bad_pack",
        label: "Bad Pack",
        tool_ids: ["missing_node"],
      },
    });
    const body = (await res.json()) as any;

    expect(res.status).toBe(400);
    expect(body.details.unknown_tool_ids).toEqual(["missing_node"]);
  });

  it("initializes D1 skills storage and migrates existing Durable Object skills", async () => {
    const skillsDb = new MockD1Database();
    const { state, store } = createStore({ SKILLS_DB: skillsDb });
    await state.storage.put("state", defaultState("Root"));
    await state.storage.put("custom_skill_packs", {
      migrated_skill: {
        key: "migrated_skill",
        label: "Migrated Skill",
        category: "ai",
        description: "Migrated from DO",
        tool_ids: ["llm_generate"],
        content_md: [
          "---",
          "key: migrated_skill",
          "label: Migrated Skill",
          "category: ai",
          "tool_ids:",
          "  - llm_generate",
          "---",
          "",
          "# Migrated Skill",
        ].join("\n"),
        created_at: 1,
        updated_at: 1,
      },
    });

    const initRes = await callApi(store, "/api/actions/skills/init", { method: "POST" });
    const initBody = (await initRes.json()) as any;
    expect(initRes.status).toBe(200);
    expect(initBody.backend).toBe("d1");
    expect(initBody.initialized).toBe(true);
    expect(initBody.custom_skill_count).toBe(1);
    expect(skillsDb.execCalls.join("\n")).toContain("CREATE TABLE IF NOT EXISTS skill_packs");

    const listRes = await callApi(store, "/api/actions/skills/available");
    const listBody = (await listRes.json()) as any;
    const migrated = listBody.skill_packs.find((pack: any) => pack.key === "migrated_skill");
    expect(migrated.custom).toBe(true);
    expect(migrated.content_md).toContain("# Migrated Skill");
    expect(skillsDb.packs.has("migrated_skill")).toBe(true);
    expect(skillsDb.files.has("custom/migrated_skill/SKILL.md")).toBe(true);
  });
});
