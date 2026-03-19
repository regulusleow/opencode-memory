import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getConfig, getEmbeddingDimensions, getProjectStoragePath } from "../src/config.js";
import { createDatabase, closeDatabase, getEmbeddingMeta, setEmbeddingMeta } from "../src/services/database.js";
import { createApiEmbeddingBackend } from "../src/services/embedding.js";
import { createMemoryStore } from "../src/services/memory-store.js";
import { createVectorBackend } from "../src/services/vector-backend.js";
import { createMemoryTool } from "../src/services/tool.js";
import type { PluginConfig } from "../src/types.js";
import type { EmbeddingService } from "../src/services/embedding.js";

const tempDirs: string[] = [];

function makeTempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

function makePluginInput(directory: string): any {
  return {
    directory,
    client: {},
  };
}

function makeConfig(overrides: Partial<PluginConfig> = {}): PluginConfig {
  return {
    embeddingApiUrl: "https://api.openai.com/v1/embeddings",
    embeddingApiKey: "",
    embeddingModel: "text-embedding-3-small",
    embeddingDimensions: 4,
    storagePath: "/tmp/opencode-memory-test",
    searchLimit: 5,
    contextLimit: 3,
    embeddingBackend: "auto",
    localModel: "nomic-ai/nomic-embed-text-v1.5",
    localDtype: "q8",
    localCacheDir: "/tmp/opencode-memory-test/models",
    ...overrides,
  };
}

function makeEmbeddingService(): EmbeddingService {
  return {
    isConfigured: () => true,
    embed: async () => ({ embedding: new Float64Array([0.1, 0.2, 0.3, 0.4]) }),
    embedBatch: async (texts) =>
      texts.map(() => ({ embedding: new Float64Array([0.1, 0.2, 0.3, 0.4]) })),
  };
}

async function importPluginFresh(tag: string): Promise<typeof import("../src/plugin.js")> {
  return import(`../src/plugin.js?test=${tag}-${Date.now()}-${Math.random()}`);
}

describe("plugin integration", () => {
  beforeEach(() => {});

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("plugin() returns chat.message hook and tool.memory", async () => {
    const projectDir = makeTempDir("opencode-memory-int-project-");

    const { plugin } = await importPluginFresh("shape");

    const hooks = await plugin(makePluginInput(projectDir));

    expect(typeof hooks["chat.message"]).toBe("function");
    expect(hooks.tool).toBeDefined();
    expect(hooks.tool?.memory).toBeDefined();
    expect(typeof hooks.tool?.memory.execute).toBe("function");
  });

  it("plugin() initializes successfully with temp directory and creates db file", async () => {
    const projectDir = makeTempDir("opencode-memory-int-project-");

    const { plugin } = await importPluginFresh("db-file");

    const hooks = await plugin(makePluginInput(projectDir));
    const dbPath = getProjectStoragePath(getConfig(projectDir).storagePath, projectDir);

    expect(hooks).toBeDefined();
    expect(existsSync(dbPath)).toBe(true);
  });

  it("assembled components support add -> search -> list -> forget lifecycle", async () => {
      const config = makeConfig();

    const db = createDatabase(":memory:", config.embeddingDimensions);

    try {
      const embeddingService = createApiEmbeddingBackend(config);
      const vectorBackend = await createVectorBackend(db, config.embeddingDimensions);
      const store = createMemoryStore(db, embeddingService, config, vectorBackend);
      const memoryTool = createMemoryTool(store, config);

      const addResult = await memoryTool.execute(
        {
          mode: "add",
          content: "Objective-C 项目的广告缓存策略",
          tags: "ios,objc,ads",
        },
        { sessionID: "ses_integration", messageID: "msg_1", agent: "test", directory: "/tmp", worktree: "/tmp", abort: new AbortController().signal, metadata: () => {}, ask: async () => {} }
      );

      expect(addResult).toContain("Memory stored with ID:");
      const idMatch = addResult.match(/Memory stored with ID: (mem_[^\s]+)/);
      expect(idMatch).toBeTruthy();
      const memoryId = idMatch?.[1] as string;

      const searchResult = await memoryTool.execute(
        { mode: "search", query: "广告缓存" },
        { sessionID: "ses_integration", messageID: "msg_2", agent: "test", directory: "/tmp", worktree: "/tmp", abort: new AbortController().signal, metadata: () => {}, ask: async () => {} }
      );
      expect(searchResult).toContain("Objective-C 项目的广告缓存策略");

      const listResult = await memoryTool.execute(
        { mode: "list" },
        { sessionID: "ses_integration", messageID: "msg_3", agent: "test", directory: "/tmp", worktree: "/tmp", abort: new AbortController().signal, metadata: () => {}, ask: async () => {} }
      );
      expect(listResult).toContain(memoryId);

      const forgetResult = await memoryTool.execute(
        { mode: "forget", memoryId },
        { sessionID: "ses_integration", messageID: "msg_4", agent: "test", directory: "/tmp", worktree: "/tmp", abort: new AbortController().signal, metadata: () => {}, ask: async () => {} }
      );
      expect(forgetResult.toLowerCase()).toMatch(/delet|remov|success/);

      const searchAfterForget = await memoryTool.execute(
        { mode: "search", query: "广告缓存" },
        { sessionID: "ses_integration", messageID: "msg_5", agent: "test", directory: "/tmp", worktree: "/tmp", abort: new AbortController().signal, metadata: () => {}, ask: async () => {} }
      );
      expect(searchAfterForget).toContain("No memories found.");
    } finally {
      closeDatabase(db);
    }
  });

  it("chat.message hook is a function", async () => {
    const projectDir = makeTempDir("opencode-memory-int-project-");

    const { plugin } = await importPluginFresh("chat-hook");

    const hooks = await plugin(makePluginInput(projectDir));
    expect(typeof hooks["chat.message"]).toBe("function");
  });

  it("plugin() handles initialization error gracefully", async () => {
    const projectDir = undefined as unknown as string;

    const { plugin } = await importPluginFresh("init-error");

    const hooks = await plugin(makePluginInput(projectDir));

    expect(hooks).toEqual({});
  });
});

describe("backend selection", () => {
  it("auto mode with API key -> uses API backend", async () => {
    const projectDir = makeTempDir("opencode-memory-int-project-");
    const dbPath = join(projectDir, "memory.db");
    const config = makeConfig({
      embeddingBackend: "auto",
      embeddingApiKey: "test-key",
      embeddingModel: "text-embedding-3-small",
      embeddingDimensions: 1536,
    });

    const apiFactory = mock(() => makeEmbeddingService());
    const localFactory = mock(() => makeEmbeddingService());

    mock.module("../src/config.js", () => ({
      getConfig: () => config,
      getProjectStoragePath: () => dbPath,
      getEmbeddingDimensions,
    }));
    mock.module("../src/services/embedding.js", () => ({
      createApiEmbeddingBackend: apiFactory,
      createEmbeddingService: apiFactory,
    }));
    mock.module("../src/services/local-embedding.js", () => ({
      createLocalEmbeddingBackend: localFactory,
    }));

    const { plugin } = await importPluginFresh("auto-api");
    await plugin(makePluginInput(projectDir));

    expect(apiFactory).toHaveBeenCalledTimes(1);
    expect(localFactory).toHaveBeenCalledTimes(0);

    const db = createDatabase(dbPath, 1536);
    try {
      expect(getEmbeddingMeta(db)).toEqual({
        modelName: "text-embedding-3-small",
        dimensions: 1536,
      });
    } finally {
      closeDatabase(db);
    }
  });

  it("auto mode without API key -> uses local backend", async () => {
    const projectDir = makeTempDir("opencode-memory-int-project-");
    const dbPath = join(projectDir, "memory.db");
    const config = makeConfig({
      embeddingBackend: "auto",
      embeddingApiKey: "",
      localModel: "nomic-ai/nomic-embed-text-v1.5",
    });

    const warmup = mock(async () => {});
    const apiFactory = mock(() => makeEmbeddingService());
    const localFactory = mock(() => ({ ...makeEmbeddingService(), warmup }));

    mock.module("../src/config.js", () => ({
      getConfig: () => config,
      getProjectStoragePath: () => dbPath,
      getEmbeddingDimensions,
    }));
    mock.module("../src/services/embedding.js", () => ({
      createApiEmbeddingBackend: apiFactory,
      createEmbeddingService: apiFactory,
    }));
    mock.module("../src/services/local-embedding.js", () => ({
      createLocalEmbeddingBackend: localFactory,
    }));

    const { plugin } = await importPluginFresh("auto-local");
    await plugin(makePluginInput(projectDir));

    expect(apiFactory).toHaveBeenCalledTimes(0);
    expect(localFactory).toHaveBeenCalledTimes(1);
    expect(warmup).toHaveBeenCalledTimes(1);

    const db = createDatabase(dbPath, 768);
    try {
      expect(getEmbeddingMeta(db)).toEqual({
        modelName: "nomic-ai/nomic-embed-text-v1.5",
        dimensions: 768,
      });
    } finally {
      closeDatabase(db);
    }
  });

  it("explicit api backend -> uses API backend even with no API key", async () => {
    const projectDir = makeTempDir("opencode-memory-int-project-");
    const dbPath = join(projectDir, "memory.db");
    const config = makeConfig({ embeddingBackend: "api", embeddingApiKey: "" });

    const apiFactory = mock(() => makeEmbeddingService());
    const localFactory = mock(() => makeEmbeddingService());

    mock.module("../src/config.js", () => ({
      getConfig: () => config,
      getProjectStoragePath: () => dbPath,
      getEmbeddingDimensions,
    }));
    mock.module("../src/services/embedding.js", () => ({
      createApiEmbeddingBackend: apiFactory,
      createEmbeddingService: apiFactory,
    }));
    mock.module("../src/services/local-embedding.js", () => ({
      createLocalEmbeddingBackend: localFactory,
    }));

    const { plugin } = await importPluginFresh("explicit-api");
    await plugin(makePluginInput(projectDir));

    expect(apiFactory).toHaveBeenCalledTimes(1);
    expect(localFactory).toHaveBeenCalledTimes(0);
  });

  it("explicit local backend -> uses local backend even with API key", async () => {
    const projectDir = makeTempDir("opencode-memory-int-project-");
    const dbPath = join(projectDir, "memory.db");
    const config = makeConfig({ embeddingBackend: "local", embeddingApiKey: "test-key" });

    const apiFactory = mock(() => makeEmbeddingService());
    const localFactory = mock(() => makeEmbeddingService());

    mock.module("../src/config.js", () => ({
      getConfig: () => config,
      getProjectStoragePath: () => dbPath,
      getEmbeddingDimensions,
    }));
    mock.module("../src/services/embedding.js", () => ({
      createApiEmbeddingBackend: apiFactory,
      createEmbeddingService: apiFactory,
    }));
    mock.module("../src/services/local-embedding.js", () => ({
      createLocalEmbeddingBackend: localFactory,
    }));

    const { plugin } = await importPluginFresh("explicit-local");
    await plugin(makePluginInput(projectDir));

    expect(apiFactory).toHaveBeenCalledTimes(0);
    expect(localFactory).toHaveBeenCalledTimes(1);
  });
});

describe("purpose parameter threading", () => {
  it("store.add() calls embed with purpose='document'", async () => {
    const config = makeConfig();
    const db = createDatabase(":memory:", config.embeddingDimensions);

    try {
      const embed = mock(async () => ({ embedding: new Float64Array([0.1, 0.2, 0.3, 0.4]) }));
      const embeddingService: EmbeddingService = {
        isConfigured: () => true,
        embed,
        embedBatch: async (texts) =>
          texts.map(() => ({ embedding: new Float64Array([0.1, 0.2, 0.3, 0.4]) })),
      };
      const vectorBackend = await createVectorBackend(db, config.embeddingDimensions);
      const store = createMemoryStore(db, embeddingService, config, vectorBackend);

      await store.add("document content");

      expect(embed).toHaveBeenCalledWith("document content", "document");
    } finally {
      closeDatabase(db);
    }
  });

  it("store.search() calls embed with purpose='query'", async () => {
    const config = makeConfig();
    const db = createDatabase(":memory:", config.embeddingDimensions);

    try {
      const embed = mock(async () => ({ embedding: new Float64Array([0.1, 0.2, 0.3, 0.4]) }));
      const embeddingService: EmbeddingService = {
        isConfigured: () => true,
        embed,
        embedBatch: async (texts) =>
          texts.map(() => ({ embedding: new Float64Array([0.1, 0.2, 0.3, 0.4]) })),
      };
      const vectorBackend = await createVectorBackend(db, config.embeddingDimensions);
      const store = createMemoryStore(db, embeddingService, config, vectorBackend);

      await store.search("query content");

      expect(embed).toHaveBeenCalledWith("query content", "query");
    } finally {
      closeDatabase(db);
    }
  });

  it("retryPendingEmbeddings() calls embedBatch with purpose='document'", async () => {
    const config = makeConfig();
    const db = createDatabase(":memory:", config.embeddingDimensions);

    try {
      const embedBatch = mock(async (texts: string[]) =>
        texts.map(() => ({ embedding: new Float64Array([0.1, 0.2, 0.3, 0.4]) }))
      );
      const embeddingService: EmbeddingService = {
        isConfigured: () => true,
        embed: async () => ({ error: "unused" }),
        embedBatch,
      };
      const vectorBackend = await createVectorBackend(db, config.embeddingDimensions);
      const store = createMemoryStore(db, embeddingService, config, vectorBackend);

      const now = Date.now();
      db.query(
        "INSERT INTO memories (id, content, tags, type, metadata, embedding_status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
      ).run("mem_pending_1", "pending 1", "", "general", "{}", "pending", now, now);
      db.query(
        "INSERT INTO memories (id, content, tags, type, metadata, embedding_status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
      ).run("mem_pending_2", "pending 2", "", "general", "{}", "pending", now + 1, now + 1);

      await store.retryPendingEmbeddings();

      expect(embedBatch).toHaveBeenCalledWith(["pending 1", "pending 2"], "document");
    } finally {
      closeDatabase(db);
    }
  });
});

describe("dimension migration", () => {
  it("first startup with empty meta -> setEmbeddingMeta called", async () => {
    const projectDir = makeTempDir("opencode-memory-int-project-");
    const dbPath = join(projectDir, "memory.db");
    const config = makeConfig({ embeddingBackend: "api", embeddingModel: "text-embedding-3-small", embeddingDimensions: 1536, embeddingApiKey: "test-key" });

    mock.module("../src/config.js", () => ({
      getConfig: () => config,
      getProjectStoragePath: () => dbPath,
      getEmbeddingDimensions,
    }));
    mock.module("../src/services/embedding.js", () => ({
      createApiEmbeddingBackend: () => makeEmbeddingService(),
      createEmbeddingService: () => makeEmbeddingService(),
    }));
    mock.module("../src/services/local-embedding.js", () => ({
      createLocalEmbeddingBackend: () => makeEmbeddingService(),
    }));

    const { plugin } = await importPluginFresh("migration-first-start");
    await plugin(makePluginInput(projectDir));

    const db = createDatabase(dbPath, 1536);
    try {
      expect(getEmbeddingMeta(db)).toEqual({
        modelName: "text-embedding-3-small",
        dimensions: 1536,
      });
    } finally {
      closeDatabase(db);
    }
  });

  it("dimension mismatch -> freshStartMigration called, vectors cleared", async () => {
    const projectDir = makeTempDir("opencode-memory-int-project-");
    const dbPath = join(projectDir, "memory.db");
    const now = Date.now();

    {
      const db = createDatabase(dbPath, 1536);
      setEmbeddingMeta(db, "text-embedding-3-small", 1536);
      db.query(
        "INSERT INTO memories (id, content, tags, type, metadata, embedding_status, vector, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
      ).run(
        "mem_migrate",
        "needs migration",
        "",
        "general",
        "{}",
        "done",
        new Uint8Array(new Float32Array([0.1, 0.2, 0.3, 0.4]).buffer.slice(0)),
        now,
        now
      );
      closeDatabase(db);
    }

    const config = makeConfig({
      embeddingBackend: "local",
      localModel: "nomic-ai/nomic-embed-text-v1.5",
      embeddingApiKey: "",
    });

    mock.module("../src/config.js", () => ({
      getConfig: () => config,
      getProjectStoragePath: () => dbPath,
      getEmbeddingDimensions,
    }));
    mock.module("../src/services/embedding.js", () => ({
      createApiEmbeddingBackend: () => makeEmbeddingService(),
      createEmbeddingService: () => makeEmbeddingService(),
    }));
    mock.module("../src/services/local-embedding.js", () => ({
      createLocalEmbeddingBackend: () => makeEmbeddingService(),
    }));

    const { plugin } = await importPluginFresh("migration-needed");
    await plugin(makePluginInput(projectDir));

    const db = createDatabase(dbPath, 768);
    try {
      const row = db
        .query("SELECT embedding_status, vector FROM memories WHERE id = ?")
        .get("mem_migrate") as { embedding_status: string; vector: Uint8Array | null };

      expect(row.embedding_status).toBe("pending");
      expect(row.vector).toBeNull();
      expect(getEmbeddingMeta(db)).toEqual({
        modelName: "nomic-ai/nomic-embed-text-v1.5",
        dimensions: 768,
      });
    } finally {
      closeDatabase(db);
    }
  });

  it("no mismatch -> migration NOT called", async () => {
    const projectDir = makeTempDir("opencode-memory-int-project-");
    const dbPath = join(projectDir, "memory.db");
    const now = Date.now();

    {
      const db = createDatabase(dbPath, 1536);
      setEmbeddingMeta(db, "text-embedding-3-small", 1536);
      db.query(
        "INSERT INTO memories (id, content, tags, type, metadata, embedding_status, vector, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
      ).run(
        "mem_keep",
        "no migration",
        "",
        "general",
        "{}",
        "done",
        new Uint8Array(new Float32Array([0.5, 0.6, 0.7, 0.8]).buffer.slice(0)),
        now,
        now
      );
      closeDatabase(db);
    }

    const config = makeConfig({
      embeddingBackend: "api",
      embeddingApiKey: "test-key",
      embeddingModel: "text-embedding-3-small",
      embeddingDimensions: 1536,
    });

    mock.module("../src/config.js", () => ({
      getConfig: () => config,
      getProjectStoragePath: () => dbPath,
      getEmbeddingDimensions,
    }));
    mock.module("../src/services/embedding.js", () => ({
      createApiEmbeddingBackend: () => makeEmbeddingService(),
      createEmbeddingService: () => makeEmbeddingService(),
    }));
    mock.module("../src/services/local-embedding.js", () => ({
      createLocalEmbeddingBackend: () => makeEmbeddingService(),
    }));

    const { plugin } = await importPluginFresh("migration-not-needed");
    await plugin(makePluginInput(projectDir));

    const db = createDatabase(dbPath, 1536);
    try {
      const row = db
        .query("SELECT embedding_status, vector FROM memories WHERE id = ?")
        .get("mem_keep") as { embedding_status: string; vector: Uint8Array | null };

      expect(row.embedding_status).toBe("done");
      expect(row.vector).not.toBeNull();
      expect(getEmbeddingMeta(db)).toEqual({
        modelName: "text-embedding-3-small",
        dimensions: 1536,
      });
    } finally {
      closeDatabase(db);
    }
  });
});
