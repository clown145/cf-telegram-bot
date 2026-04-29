import { jsonResponse } from "../utils";

export interface CustomSkillFile {
  path: string;
  content_md: string;
  content_type?: string;
  kind?: string;
  title?: string;
  category?: string;
  tool_id?: string;
  created_at?: number;
  updated_at?: number;
}

export interface CustomSkillPack {
  key: string;
  label: string;
  category: string;
  description: string;
  tool_ids: string[];
  content_md: string;
  files?: CustomSkillFile[];
  filename?: string;
  created_at: number;
  updated_at: number;
}

export interface D1SkillPackRow {
  key: string;
  label: string;
  category: string;
  description: string | null;
  tool_ids_json: string;
  root_path: string;
  filename: string | null;
  content_md: string | null;
  created_at: number;
  updated_at: number;
}

export interface D1SkillFileRow {
  path: string;
  skill_key: string;
  namespace: string;
  content: string;
  content_type: string | null;
  created_at: number;
  updated_at: number;
}

interface D1PreparedStatementLike {
  bind(...values: unknown[]): D1PreparedStatementLike;
  all<T = Record<string, unknown>>(): Promise<{ results?: T[] }>;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run(): Promise<unknown>;
}

export interface D1DatabaseLike {
  exec(query: string): Promise<unknown>;
  prepare(query: string): D1PreparedStatementLike;
}

export interface DurableObjectStorage {
  get<T>(key: string): Promise<T | undefined>;
  put(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<boolean> | Promise<void>;
}

export class SkillsStorageService {
  private storage: DurableObjectStorage;
  private db: D1DatabaseLike | null;
  private skillsD1Ready = false;
  private skillsD1MigrationChecked = false;

  constructor(storage: DurableObjectStorage, db: D1DatabaseLike | null) {
    this.storage = storage;
    this.db = db;
  }

  normalizeSkillPackKey(input: unknown): string {
    return String(input || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 64);
  }

  sanitizeSkillRelativePath(input: unknown): string {
    const raw = String(input || "")
      .replace(/\0/g, "")
      .replace(/\\/g, "/")
      .trim();
    const withoutScheme = raw
      .replace(/^skills:\/\//i, "")
      .replace(/^skills:\//i, "")
      .replace(/^\/+/, "");
    const parts = withoutScheme
      .split("/")
      .map((part) => part.trim())
      .filter(Boolean);
    if (parts.some((part) => part === "." || part === "..")) {
      return "";
    }
    return parts.join("/").slice(0, 240);
  }

  normalizeCustomSkillFilePath(packKey: string, input: unknown): string {
    const path = this.sanitizeSkillRelativePath(input);
    if (!path) {
      return "";
    }
    if (path === `custom/${packKey}`) {
      return `custom/${packKey}/SKILL.md`;
    }
    if (path.startsWith(`custom/${packKey}/`)) {
      return path;
    }
    if (path.startsWith(`${packKey}/`)) {
      return `custom/${path}`;
    }
    if (path.startsWith("custom/")) {
      return "";
    }
    return `custom/${packKey}/${path}`;
  }

  ensureRootCustomSkillFile(
    packKey: string,
    files: CustomSkillFile[],
    rootContent: string,
    now = Date.now()
  ): CustomSkillFile[] {
    const rootPath = `custom/${packKey}/SKILL.md`;
    const normalized = files.map((file) => ({
      ...file,
      path: this.normalizeCustomSkillFilePath(packKey, file.path),
      content_md: String(file.content_md || ""),
      content_type: file.content_type || "text/markdown",
    })).filter((file) => file.path && file.content_md.length <= 256 * 1024);
    const hasRoot = normalized.some((file) => file.path === rootPath);
    if (!hasRoot) {
      normalized.unshift({
        path: rootPath,
        kind: "root",
        title: packKey,
        content_md: rootContent,
        content_type: "text/markdown",
        created_at: now,
        updated_at: now,
      });
    }
    return normalized.map((file) => ({
      ...file,
      kind: file.kind || (file.path.endsWith("/SKILL.md") ? "root" : "reference"),
      created_at: Number(file.created_at || now),
      updated_at: Number(file.updated_at || now),
    }));
  }

  resolveCustomSkillRootPath(pack: CustomSkillPack): string {
    const files = Array.isArray(pack.files) ? pack.files : [];
    return (
      files.find((file) => file.path === `custom/${pack.key}/SKILL.md`)?.path ||
      files.find((file) => file.path.endsWith("/SKILL.md"))?.path ||
      `custom/${pack.key}/SKILL.md`
    );
  }

  trimSkillScalar(input: string): string {
    const value = String(input || "").trim();
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      return value.slice(1, -1).trim();
    }
    return value;
  }

  parseSkillListValue(input: string): string[] {
    const value = this.trimSkillScalar(input);
    if (!value) return [];
    const inlineList = value.match(/^\[(.*)\]$/);
    const rawItems = inlineList ? inlineList[1].split(",") : value.split(",");
    return rawItems.map((item) => this.trimSkillScalar(item)).filter(Boolean);
  }

  parseSkillMarkdownFrontmatter(markdown: string): Record<string, unknown> {
    const text = String(markdown || "").replace(/^\uFEFF/, "");
    const match = text.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)/);
    if (!match) {
      return {};
    }
    const meta: Record<string, unknown> = {};
    let currentListKey = "";
    for (const rawLine of match[1].split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const listItem = line.match(/^-\s*(.+)$/);
      if (listItem && currentListKey) {
        const list = Array.isArray(meta[currentListKey]) ? (meta[currentListKey] as string[]) : [];
        list.push(this.trimSkillScalar(listItem[1]));
        meta[currentListKey] = list.filter(Boolean);
        continue;
      }
      const keyValue = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
      if (!keyValue) continue;
      const key = keyValue[1].trim();
      const value = keyValue[2].trim();
      if (!value) {
        meta[key] = [];
        currentListKey = key;
        continue;
      }
      currentListKey = "";
      meta[key] = key === "tool_ids" || key === "tools"
        ? this.parseSkillListValue(value)
        : this.trimSkillScalar(value);
    }
    return meta;
  }

  stripSkillMarkdownFrontmatter(markdown: string): string {
    return String(markdown || "")
      .replace(/^\uFEFF/, "")
      .replace(/^---\s*\r?\n[\s\S]*?\r?\n---\s*(?:\r?\n|$)/, "")
      .trim();
  }

  private async ensureSkillsD1Schema(): Promise<void> {
    if (this.skillsD1Ready || !this.db) {
      return;
    }
    const statements = [
      `CREATE TABLE IF NOT EXISTS skill_packs (
        key TEXT PRIMARY KEY,
        label TEXT NOT NULL,
        category TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        tool_ids_json TEXT NOT NULL,
        root_path TEXT NOT NULL,
        filename TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS skill_files (
        path TEXT PRIMARY KEY,
        skill_key TEXT NOT NULL,
        namespace TEXT NOT NULL,
        content TEXT NOT NULL,
        content_type TEXT NOT NULL DEFAULT 'text/markdown',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )`,
      "CREATE INDEX IF NOT EXISTS idx_skill_files_skill_key ON skill_files(skill_key)",
      "CREATE INDEX IF NOT EXISTS idx_skill_files_namespace ON skill_files(namespace)",
    ];
    for (const statement of statements) {
      await this.db.exec(statement);
    }
    this.skillsD1Ready = true;
  }

  normalizeStoredCustomSkillPacks(
    stored: Record<string, Partial<CustomSkillPack>>
  ): Record<string, CustomSkillPack> {
    const normalized: Record<string, CustomSkillPack> = {};
    for (const [rawKey, rawPack] of Object.entries(stored)) {
      const pack = rawPack && typeof rawPack === "object" ? rawPack : null;
      if (!pack) continue;
      const key = this.normalizeSkillPackKey(pack.key || rawKey);
      const toolIds = Array.isArray(pack.tool_ids)
        ? Array.from(new Set(pack.tool_ids.map((id) => String(id || "").trim()).filter(Boolean)))
        : [];
      if (!key) continue;
      const label = String(pack.label || key).trim() || key;
      const category = String(pack.category || "custom").trim() || "custom";
      const description = String(pack.description || "").trim();
      const contentMd = String(
        pack.content_md ||
          (pack as Record<string, unknown>).markdown ||
          (pack as Record<string, unknown>).content ||
          ""
      ).trim();
      const rawFiles = Array.isArray((pack as Record<string, unknown>).files)
        ? ((pack as Record<string, unknown>).files as unknown[])
        : [];
      const files = this.ensureRootCustomSkillFile(
        key,
        rawFiles
          .map((entry) => (entry && typeof entry === "object" ? (entry as Record<string, unknown>) : null))
          .filter((entry): entry is Record<string, unknown> => Boolean(entry))
          .map((entry) => ({
            path: String(entry.path || entry.filename || entry.name || "").trim(),
            content_md: String(entry.content_md || entry.markdown || entry.content || entry.md || ""),
            content_type: typeof entry.content_type === "string" ? entry.content_type : "text/markdown",
            kind: typeof entry.kind === "string" ? entry.kind : undefined,
            title: typeof entry.title === "string" ? entry.title : undefined,
            category: typeof entry.category === "string" ? entry.category : undefined,
            tool_id: typeof entry.tool_id === "string" ? entry.tool_id : undefined,
            created_at: Number(entry.created_at || pack.created_at || Date.now()),
            updated_at: Number(entry.updated_at || pack.updated_at || Date.now()),
          })),
        contentMd || this.buildSkillMarkdownDocument({
          key,
          label,
          category,
          description,
          tools: toolIds.map((id) => ({ id, name: id })),
        }),
        Number(pack.updated_at || Date.now())
      );
      const rootFile = files.find((file) => file.path === `custom/${key}/SKILL.md`) || files.find((file) => file.path.endsWith("/SKILL.md"));
      const normalizedContentMd = contentMd || rootFile?.content_md || "";
      normalized[key] = {
        key,
        label,
        category,
        description,
        tool_ids: toolIds,
        content_md: normalizedContentMd || this.buildSkillMarkdownDocument({
          key,
          label,
          category,
          description,
          tools: toolIds.map((id) => ({ id, name: id })),
        }),
        files,
        filename: typeof pack.filename === "string" ? pack.filename : undefined,
        created_at: Number(pack.created_at || Date.now()),
        updated_at: Number(pack.updated_at || Date.now()),
      };
    }
    return normalized;
  }

  private buildSkillMarkdownDocument(args: {
    key: string;
    label: string;
    category: string;
    description: string;
    tools: Array<{ id: string; name: string }>;
  }): string {
    const lines = [
      "---",
      `name: ${args.key}`,
      `description: ${args.description || args.label}`,
      "---",
      "",
      `# ${args.label}`,
      "",
      args.description || `Skill pack: ${args.label}`,
    ];
    if (args.tools.length > 0) {
      lines.push("", "## Tools", "");
      for (const tool of args.tools) {
        lines.push(`- ${tool.name} (${tool.id})`);
      }
    }
    return lines.join("\n");
  }

  private async loadDoCustomSkillPacks(): Promise<Record<string, CustomSkillPack>> {
    const stored =
      (await this.storage.get<Record<string, CustomSkillPack>>("custom_skill_packs")) ?? {};
    return this.normalizeStoredCustomSkillPacks(stored);
  }

  private async saveDoCustomSkillPacks(packs: Record<string, CustomSkillPack>): Promise<void> {
    await this.storage.put("custom_skill_packs", packs);
  }

  private async migrateDoSkillsToD1IfNeeded(): Promise<void> {
    if (this.skillsD1MigrationChecked || !this.db) {
      return;
    }
    await this.ensureSkillsD1Schema();
    const row = await this.db.prepare("SELECT COUNT(*) AS count FROM skill_packs").first<{ count: number }>();
    if (Number(row?.count || 0) === 0) {
      const existingDoPacks = await this.loadDoCustomSkillPacks();
      if (Object.keys(existingDoPacks).length > 0) {
        await this.saveD1CustomSkillPacks(existingDoPacks);
      }
    }
    this.skillsD1MigrationChecked = true;
  }

  private async loadD1CustomSkillPacks(): Promise<Record<string, CustomSkillPack>> {
    if (!this.db) {
      return {};
    }
    await this.ensureSkillsD1Schema();
    await this.migrateDoSkillsToD1IfNeeded();
    const result = await this.db
      .prepare(
        `SELECT
          key,
          label,
          category,
          description,
          tool_ids_json,
          root_path,
          filename,
          created_at,
          updated_at
        FROM skill_packs
        ORDER BY key`
      )
      .all<D1SkillPackRow>();
    const fileResult = await this.db
      .prepare(
        `SELECT
          path,
          skill_key,
          namespace,
          content,
          content_type,
          created_at,
          updated_at
        FROM skill_files
        WHERE namespace = 'custom'
        ORDER BY path`
      )
      .all<D1SkillFileRow>();
    const filesByPack = new Map<string, CustomSkillFile[]>();
    for (const file of fileResult.results || []) {
      const key = String(file.skill_key || "").trim();
      if (!key) continue;
      const list = filesByPack.get(key) || [];
      list.push({
        path: file.path,
        content_md: file.content || "",
        content_type: file.content_type || "text/markdown",
        kind: file.path.endsWith("/SKILL.md") ? "root" : "reference",
        created_at: Number(file.created_at || Date.now()),
        updated_at: Number(file.updated_at || Date.now()),
      });
      filesByPack.set(key, list);
    }
    const stored: Record<string, Partial<CustomSkillPack>> = {};
    for (const row of result.results || []) {
      let toolIds: string[] = [];
      try {
        const parsed = JSON.parse(row.tool_ids_json || "[]");
        toolIds = Array.isArray(parsed) ? parsed.map((id) => String(id || "").trim()).filter(Boolean) : [];
      } catch {
        toolIds = [];
      }
      const files = filesByPack.get(row.key) || [];
      const rootContent = files.find((file) => file.path === row.root_path)?.content_md || files.find((file) => file.path.endsWith("/SKILL.md"))?.content_md || "";
      stored[row.key] = {
        key: row.key,
        label: row.label,
        category: row.category,
        description: row.description || "",
        tool_ids: toolIds,
        content_md: rootContent,
        files,
        filename: row.filename || undefined,
        created_at: Number(row.created_at || Date.now()),
        updated_at: Number(row.updated_at || Date.now()),
      };
    }
    return this.normalizeStoredCustomSkillPacks(stored);
  }

  private async saveD1CustomSkillPacks(
    packs: Record<string, CustomSkillPack>
  ): Promise<void> {
    if (!this.db) {
      return;
    }
    await this.ensureSkillsD1Schema();
    const existingRows = await this.db.prepare("SELECT key FROM skill_packs").all<{ key: string }>();
    const nextKeys = new Set(Object.keys(packs));
    for (const row of existingRows.results || []) {
      if (!nextKeys.has(row.key)) {
        await this.db
          .prepare("DELETE FROM skill_files WHERE skill_key = ? AND namespace = 'custom'")
          .bind(row.key)
          .run();
        await this.db.prepare("DELETE FROM skill_packs WHERE key = ?").bind(row.key).run();
      }
    }

    for (const pack of Object.values(packs)) {
      const now = Date.now();
      const createdAt = Number(pack.created_at || now);
      const updatedAt = Number(pack.updated_at || now);
      const files = this.ensureRootCustomSkillFile(pack.key, pack.files || [], pack.content_md || "", updatedAt);
      const rootPath = this.resolveCustomSkillRootPath({ ...pack, files });
      await this.db
        .prepare(
          `INSERT INTO skill_packs (
            key, label, category, description, tool_ids_json, root_path, filename, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(key) DO UPDATE SET
            label = excluded.label,
            category = excluded.category,
            description = excluded.description,
            tool_ids_json = excluded.tool_ids_json,
            root_path = excluded.root_path,
            filename = excluded.filename,
            updated_at = excluded.updated_at`
        )
        .bind(
          pack.key,
          pack.label,
          pack.category,
          pack.description || "",
          JSON.stringify(pack.tool_ids || []),
          rootPath,
          pack.filename || null,
          createdAt,
          updatedAt
        )
        .run();
      await this.db
        .prepare("DELETE FROM skill_files WHERE skill_key = ? AND namespace = 'custom'")
        .bind(pack.key)
        .run();
      for (const file of files) {
        await this.db
          .prepare(
            `INSERT INTO skill_files (
              path, skill_key, namespace, content, content_type, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(path) DO UPDATE SET
              content = excluded.content,
              content_type = excluded.content_type,
              updated_at = excluded.updated_at`
          )
          .bind(
            file.path,
            pack.key,
            "custom",
            file.content_md || "",
            file.content_type || "text/markdown",
            Number(file.created_at || createdAt),
            Number(file.updated_at || updatedAt)
          )
          .run();
      }
    }
  }

  async loadCustomSkillPacks(): Promise<Record<string, CustomSkillPack>> {
    if (this.db) {
      return await this.loadD1CustomSkillPacks();
    }
    return await this.loadDoCustomSkillPacks();
  }

  async saveCustomSkillPacks(packs: Record<string, CustomSkillPack>): Promise<void> {
    if (this.db) {
      await this.saveD1CustomSkillPacks(packs);
      return;
    }
    await this.saveDoCustomSkillPacks(packs);
  }

  async handleSkillStorageStatus(initialize = false): Promise<Response> {
    const { jsonResponse } = await import("../utils");
    if (!this.db) {
      const packs = await this.loadDoCustomSkillPacks();
      return jsonResponse({
        backend: "durable_object",
        d1_bound: false,
        initialized: true,
        custom_skill_count: Object.keys(packs).length,
      });
    }
    await this.ensureSkillsD1Schema();
    if (initialize) {
      await this.migrateDoSkillsToD1IfNeeded();
    }
    const row = await this.db.prepare("SELECT COUNT(*) AS count FROM skill_packs").first<{ count: number }>();
    return jsonResponse({
      backend: "d1",
      d1_bound: true,
      initialized: true,
      custom_skill_count: Number(row?.count || 0),
      tables: ["skill_packs", "skill_files"],
      migrated_from_durable_object: this.skillsD1MigrationChecked,
    });
  }

  skillStorageErrorResponse(error: unknown): Response {
    const message = error instanceof Error ? error.message : String(error);
    return jsonResponse(
      {
        error: "skills storage operation failed",
        backend: this.db ? "d1" : "durable_object",
        detail: message,
      },
      500
    );
  }

  extractSkillMarkdownTitle(markdown: string): string {
    const body = this.stripSkillMarkdownFrontmatter(markdown);
    const match = body.match(/^#\s+(.+)$/m);
    return match ? match[1].trim() : "";
  }

  extractSkillMarkdownDescription(markdown: string): string {
    const body = this.stripSkillMarkdownFrontmatter(markdown);
    for (const rawLine of body.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#") || line.startsWith("- ") || line.startsWith("```")) {
        continue;
      }
      return line.slice(0, 240);
    }
    return "";
  }

  extractSkillToolIds(payload: Record<string, unknown>): string[] {
    const rawToolIds = Array.isArray(payload.tool_ids) ? payload.tool_ids : payload.tools;
    if (!Array.isArray(rawToolIds)) {
      return [];
    }
    return Array.from(
      new Set(
        rawToolIds
          .map((entry) => {
            if (typeof entry === "string" || typeof entry === "number") {
              return String(entry).trim();
            }
            if (entry && typeof entry === "object") {
              return String((entry as Record<string, unknown>).id || "").trim();
            }
            return "";
          })
          .filter(Boolean)
      )
    );
  }

  getSkillMarkdownFromPayload(payload: Record<string, unknown>): string {
    const candidate = payload.content_md ?? payload.markdown ?? payload.content ?? payload.md;
    return typeof candidate === "string" ? candidate.trim() : "";
  }

  collectSkillFilesFromPayload(
    packKey: string,
    payload: Record<string, unknown>,
    rootContent: string,
    now = Date.now()
  ): { files?: CustomSkillFile[]; error?: string; details?: unknown } {
    const rawFiles = Array.isArray(payload.files) ? payload.files : [];
    const files: CustomSkillFile[] = [];
    for (const [index, entry] of rawFiles.entries()) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        return { error: "skill files must be objects", details: { index } };
      }
      const file = entry as Record<string, unknown>;
      const rawPath = file.path || file.filename || file.name;
      const path = this.normalizeCustomSkillFilePath(packKey, rawPath);
      if (!path) {
        return { error: "skill file path is invalid", details: { index, path: rawPath } };
      }
      const content = String(file.content_md ?? file.markdown ?? file.content ?? file.md ?? "");
      if (content.length > 256 * 1024) {
        return { error: "skill file is too large; maximum is 256KB", details: { path } };
      }
      files.push({
        path,
        content_md: content,
        content_type: typeof file.content_type === "string" ? file.content_type : "text/markdown",
        kind: typeof file.kind === "string" ? file.kind : undefined,
        title: typeof file.title === "string" ? file.title : undefined,
        category: typeof file.category === "string" ? file.category : undefined,
        tool_id: typeof file.tool_id === "string" ? file.tool_id : undefined,
        created_at: now,
        updated_at: now,
      });
    }

    if (rootContent) {
      const rootPath = `custom/${packKey}/SKILL.md`;
      const existingRoot = files.find((file) => file.path === rootPath);
      if (existingRoot) {
        existingRoot.content_md = existingRoot.content_md || rootContent;
        existingRoot.kind = existingRoot.kind || "root";
      } else {
        files.unshift({
          path: rootPath,
          content_md: rootContent,
          content_type: "text/markdown",
          kind: "root",
          created_at: now,
          updated_at: now,
        });
      }
    }

    const deduped = new Map<string, CustomSkillFile>();
    for (const file of files) {
      deduped.set(file.path, file);
    }
    const normalized = Array.from(deduped.values()).sort((a, b) => {
      if (a.path.endsWith("/SKILL.md") && !b.path.endsWith("/SKILL.md")) return -1;
      if (!a.path.endsWith("/SKILL.md") && b.path.endsWith("/SKILL.md")) return 1;
      return a.path.localeCompare(b.path);
    });
    if (normalized.length > 80) {
      return { error: "skill package has too many files; maximum is 80" };
    }
    const totalSize = normalized.reduce((sum, file) => sum + file.content_md.length, 0);
    if (totalSize > 768 * 1024) {
      return { error: "skill package is too large; maximum is 768KB" };
    }
    return { files: this.ensureRootCustomSkillFile(packKey, normalized, rootContent, now) };
  }
}
