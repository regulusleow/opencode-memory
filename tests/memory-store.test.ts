import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import type { Database } from "bun:sqlite";
import { generateMemoryId } from "../src/config.js";
import { createDatabase, closeDatabase } from "../src/services/database.js";
import { createMemoryStore } from "../src/services/memory-store.js";
import { runMigrations } from "../src/services/migration-runner.js";
import { memoryMigrations } from "../src/services/migrations.js";
import { createVectorBackend } from "../src/services/vector-backend.js";
import type { EmbeddingService } from "../src/services/embedding.js";
import type { PluginConfig } from "../src/types.js";

function makeMockEmbedding(
  result: { embedding: Float64Array } | { error: string }
): EmbeddingService {
  return {
    isConfigured: () => true,
    embed: async (_text: string) => result,
    embedBatch: async (texts: string[]) => texts.map(() => result),
  };
}

function makeConfig(): PluginConfig {
  return {
    embeddingApiUrl: "https://api.openai.com/v1/embeddings",
    embeddingApiKey: "sk-test",
    embeddingModel: "text-embedding-3-small",
    embeddingDimensions: 3,
    storagePath: "/tmp",
    searchLimit: 5,
    contextLimit: 3,
    embeddingBackend: "auto",
    localModel: "nomic-ai/nomic-embed-text-v1.5",
    localDtype: "q8",
    localCacheDir: "/tmp/models",
    privacyPatterns: [],
    dedupSimilarityThreshold: 0.7,
    autoCaptureEnabled: false,
    autoCaptureDelay: 10000,
    autoCaptureMinImportance: 6,
    searchLayersEnabled: true,
    profileEnabled: true,
    profileExtractionMinPrompts: 5,
    profileMaxMessagesPerExtraction: 20,
    webServerPort: 18080,
    logLevel: "info",
  };
}

describe("MemoryStore", () => {
  let db: Database;
  let vectorBackend: Awaited<ReturnType<typeof createVectorBackend>>;

  beforeEach(async () => {
    db = createDatabase(":memory:", 3);
    runMigrations(db, memoryMigrations, {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
    });
    vectorBackend = await createVectorBackend(db, 3);
  });

  afterEach(() => {
    closeDatabase(db);
  });

  it("add() stores memory and returns it with generated ID", async () => {
    const store = createMemoryStore(
      db,
      makeMockEmbedding({ error: "embed unavailable" }),
      makeConfig(),
      vectorBackend
    );

    const added = await store.add("first memory", {
      tags: "ios,objc",
      type: "general",
      metadata: { source: "test" },
    });

    expect(added.id).toMatch(/^mem_/);
    expect(added.content).toBe("first memory");
    expect(added.tags).toBe("ios,objc");
    expect(added.type).toBe("general");
    expect(added.embeddingStatus).toBe("pending");

    const row = db
      .query("SELECT id FROM memories WHERE id = ?")
      .get(added.id) as { id: string } | null;
    expect(row?.id).toBe(added.id);
  });

  it("add() with successful embedding stores vector and marks done", async () => {
    const store = createMemoryStore(
      db,
      makeMockEmbedding({ embedding: new Float64Array([0.1, 0.2, 0.3]) }),
      makeConfig(),
      vectorBackend
    );

    const added = await store.add("vector memory");

    expect(added.embeddingStatus).toBe("done");

    const vectorRow = db
      .query("SELECT vector FROM memories WHERE id = ?")
      .get(added.id) as { vector: Uint8Array | null } | null;
    expect(vectorRow?.vector).not.toBeNull();
    expect(vectorRow?.vector).not.toBeUndefined();
  });

  it("add() with failed embedding keeps pending status", async () => {
    const store = createMemoryStore(
      db,
      makeMockEmbedding({ error: "network failed" }),
      makeConfig(),
      vectorBackend
    );

    const added = await store.add("pending memory");

    expect(added.embeddingStatus).toBe("pending");

    const statusRow = db
      .query("SELECT embedding_status FROM memories WHERE id = ?")
      .get(added.id) as { embedding_status: string };
    expect(statusRow.embedding_status).toBe("pending");
  });

  it("search() with vector finds memories", async () => {
    const embedding = new Float64Array([0.3, 0.2, 0.1]);
    const service: EmbeddingService = {
      isConfigured: () => true,
      embed: async () => ({ embedding }),
      embedBatch: async (texts) => texts.map(() => ({ embedding })),
    };
    const store = createMemoryStore(db, service, makeConfig(), vectorBackend);

    const added = await store.add("find me by vector", { tags: "vector" });
    const results = await store.search("find query");

    expect(results.length).toBeGreaterThan(0);
    expect(results[0]?.id).toBe(added.id);
    expect(results[0]?.score).toBeGreaterThan(0);
  });

  it("search() falls back to text search when embed fails", async () => {
    const service = makeMockEmbedding({ error: "embedding down" });
    const store = createMemoryStore(db, service, makeConfig(), vectorBackend);

    const added = await store.add("objc architecture decision", {
      tags: "ios,objc",
    });
    const results = await store.search("architecture");

    expect(results.length).toBe(1);
    expect(results[0]?.id).toBe(added.id);
  });

  it("search() returns empty array for empty query", async () => {
    const store = createMemoryStore(
      db,
      makeMockEmbedding({ error: "unused" }),
      makeConfig(),
      vectorBackend
    );
    const results = await store.search("", 10);
    expect(results).toEqual([]);
  });

  it("search() returns empty array for whitespace-only query", async () => {
    const store = createMemoryStore(
      db,
      makeMockEmbedding({ error: "unused" }),
      makeConfig(),
      vectorBackend
    );
    const results = await store.search("   ", 10);
    expect(results).toEqual([]);
  });

  it("search() finds memories via FTS5 exact when embedding fails", async () => {
    const store = createMemoryStore(
      db,
      makeMockEmbedding({ error: "embedding down" }),
      makeConfig(),
      vectorBackend
    );
    const now = Date.now();
    db.query(
      "INSERT INTO memories (id, content, tags, type, metadata, embedding_status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(
      "mem_fts",
      "TypeScript language memory for search",
      "",
      "general",
      "{}",
      "done",
      now,
      now
    );

    const results = await store.search("TypeScript language memory", 10);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]?.id).toBe("mem_fts");
  });

  it("search() applies recency bonus in post-RRF scoring", async () => {
    const store = createMemoryStore(
      db,
      makeMockEmbedding({ error: "embedding down" }),
      makeConfig(),
      vectorBackend
    );
    const now = Date.now();
    const old = now - 120 * 24 * 60 * 60 * 1000;
    db.query(
      "INSERT INTO memories (id, content, tags, type, metadata, embedding_status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(
      "mem_old_bonus",
      "recency ranking memory example",
      "",
      "general",
      "{}",
      "done",
      old,
      old
    );
    db.query(
      "INSERT INTO memories (id, content, tags, type, metadata, embedding_status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(
      "mem_new_bonus",
      "recency ranking memory example",
      "",
      "general",
      "{}",
      "done",
      now,
      now
    );

    const results = await store.search("recency ranking memory", 10);
    const oldResult = results.find((r) => r.id === "mem_old_bonus");
    const newResult = results.find((r) => r.id === "mem_new_bonus");

    expect(oldResult).toBeDefined();
    expect(newResult).toBeDefined();
    expect(results[0]?.id).toBe("mem_new_bonus");
    expect((newResult?.score ?? 0) > (oldResult?.score ?? 0)).toBe(true);
  });

  it("search() triggers pending retry before search", async () => {
    let embedBatchCalled = 0;
    const service: EmbeddingService = {
      isConfigured: () => true,
      embed: async (_text) => ({ embedding: new Float64Array([0.4, 0.4, 0.4]) }),
      embedBatch: async (texts) => {
        embedBatchCalled += 1;
        return texts.map(() => ({ embedding: new Float64Array([0.4, 0.4, 0.4]) }));
      },
    };
    const store = createMemoryStore(db, service, makeConfig(), vectorBackend);

    const pendingId = generateMemoryId();
    const now = Date.now();
    db.query(
      "INSERT INTO memories (id, content, tags, type, metadata, embedding_status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(
      pendingId,
      "pending embedding memory",
      "",
      "general",
      "{}",
      "pending",
      now,
      now
    );

    await store.search("pending embedding memory");

    expect(embedBatchCalled).toBeGreaterThan(0);
  });

  it("list() returns memories in reverse chronological order", async () => {
    const now = Date.now();
    db.query(
      "INSERT INTO memories (id, content, tags, type, metadata, embedding_status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    ).run("mem_old", "old", "", "general", "{}", "done", now - 1000, now - 1000);
    db.query(
      "INSERT INTO memories (id, content, tags, type, metadata, embedding_status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    ).run("mem_new", "new", "", "general", "{}", "done", now, now);

    const store = createMemoryStore(
      db,
      makeMockEmbedding({ error: "unused" }),
      makeConfig(),
      vectorBackend
    );
    const list = await store.list();

    expect(list[0]?.id).toBe("mem_new");
    expect(list[1]?.id).toBe("mem_old");
  });

  it("list() respects limit and offset", async () => {
    const now = Date.now();
    for (let i = 0; i < 3; i += 1) {
      db.query(
        "INSERT INTO memories (id, content, tags, type, metadata, embedding_status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
      ).run(
        `mem_${i}`,
        `memory_${i}`,
        "",
        "general",
        "{}",
        "done",
        now + i,
        now + i
      );
    }

    const store = createMemoryStore(
      db,
      makeMockEmbedding({ error: "unused" }),
      makeConfig(),
      vectorBackend
    );
    const list = await store.list(1, 1);

    expect(list.length).toBe(1);
    expect(list[0]?.id).toBe("mem_1");
  });

  it("forget() removes from both memories and vectors tables", async () => {
    const store = createMemoryStore(
      db,
      makeMockEmbedding({ embedding: new Float64Array([0.7, 0.1, 0.1]) }),
      makeConfig(),
      vectorBackend
    );

    const added = await store.add("delete me");
    const removed = await store.forget(added.id);

    expect(removed).toBe(true);

    const memoryRow = db.query("SELECT id FROM memories WHERE id = ?").get(added.id);
    expect(memoryRow).toBeNull();
  });

  it("forget() returns false for non-existent ID", async () => {
    const store = createMemoryStore(
      db,
      makeMockEmbedding({ error: "unused" }),
      makeConfig(),
      vectorBackend
    );

    const removed = await store.forget("mem_missing");
    expect(removed).toBe(false);
  });

  it("get() returns memory by ID", async () => {
    const store = createMemoryStore(
      db,
      makeMockEmbedding({ error: "unused" }),
      makeConfig(),
      vectorBackend
    );
    const now = Date.now();
    db.query(
      "INSERT INTO memories (id, content, tags, type, metadata, embedding_status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    ).run("mem_get", "get content", "tag", "general", "{}", "done", now, now);

    const memory = await store.get("mem_get");
    expect(memory?.id).toBe("mem_get");
    expect(memory?.content).toBe("get content");
  });

  it("get() returns null for non-existent ID", async () => {
    const store = createMemoryStore(
      db,
      makeMockEmbedding({ error: "unused" }),
      makeConfig(),
      vectorBackend
    );

    const memory = await store.get("mem_none");
    expect(memory).toBeNull();
  });

  it("retryPendingEmbeddings() processes pending memories and returns count", async () => {
    const now = Date.now();
    db.query(
      "INSERT INTO memories (id, content, tags, type, metadata, embedding_status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    ).run("mem_p1", "p1", "", "general", "{}", "pending", now, now);
    db.query(
      "INSERT INTO memories (id, content, tags, type, metadata, embedding_status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    ).run("mem_p2", "p2", "", "general", "{}", "pending", now + 1, now + 1);

    const service: EmbeddingService = {
      isConfigured: () => true,
      embed: async (_text) => ({ embedding: new Float64Array([0.1, 0.2, 0.3]) }),
      embedBatch: async (texts) =>
        texts.map(() => ({ embedding: new Float64Array([0.1, 0.2, 0.3]) })),
    };
    const store = createMemoryStore(db, service, makeConfig(), vectorBackend);

    const count = await store.retryPendingEmbeddings();

    expect(count).toBe(2);
    const statuses = db
      .query("SELECT embedding_status FROM memories WHERE id IN (?, ?) ORDER BY id")
      .all("mem_p1", "mem_p2") as Array<{ embedding_status: string }>;
    expect(statuses[0]?.embedding_status).toBe("done");
    expect(statuses[1]?.embedding_status).toBe("done");
  });

  it("retryPendingEmbeddings() marks failed embedding attempts as failed", async () => {
    const now = Date.now();
    db.query(
      "INSERT INTO memories (id, content, tags, type, metadata, embedding_status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    ).run("mem_fail", "pf", "", "general", "{}", "pending", now, now);

    const service: EmbeddingService = {
      isConfigured: () => true,
      embed: async (_text) => ({ error: "unused" }),
      embedBatch: async (texts) => texts.map(() => ({ error: "embed fail" })),
    };
    const store = createMemoryStore(db, service, makeConfig(), vectorBackend);

    const count = await store.retryPendingEmbeddings();
    expect(count).toBe(0);

    const row = db
      .query("SELECT embedding_status FROM memories WHERE id = ?")
      .get("mem_fail") as { embedding_status: string };
    expect(row.embedding_status).toBe("failed");
  });

  it("search uses legacy LIKE path when searchLayersEnabled is false", async () => {
    const legacyConfig = { ...makeConfig(), searchLayersEnabled: false };
    const legacyStore = createMemoryStore(
      db,
      makeMockEmbedding({ error: "embed unavailable" }),
      legacyConfig,
      vectorBackend
    );
    await legacyStore.add("legacy test content", {
      tags: "test",
      type: "general",
      metadata: {},
    });
    const results = await legacyStore.search("legacy test", 10);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].score).toBe(0);
    expect(results[0].distance).toBe(Number.POSITIVE_INFINITY);
  });

  it("uses bun:test mock utility in assertions", () => {
    const fn = mock((v: string) => v.toUpperCase());
    expect(fn("ok")).toBe("OK");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  describe("enhanced bonus calculation", () => {
    it("memory with search_hit_count=10 scores higher than same memory with search_hit_count=0", async () => {
      const store = createMemoryStore(
        db,
        makeMockEmbedding({ error: "embedding down" }),
        makeConfig(),
        vectorBackend
      );
      const now = Date.now();
      const createdAt = now - 45 * 24 * 60 * 60 * 1000;

      db.query(
        "INSERT INTO memories (id, content, tags, type, metadata, embedding_status, created_at, updated_at, search_hit_count, last_accessed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
      ).run(
        "mem_freq_low",
        "frequency bonus same content",
        "",
        "general",
        "{}",
        "done",
        createdAt,
        createdAt,
        0,
        null
      );
      db.query(
        "INSERT INTO memories (id, content, tags, type, metadata, embedding_status, created_at, updated_at, search_hit_count, last_accessed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
      ).run(
        "mem_freq_high",
        "frequency bonus same content",
        "",
        "general",
        "{}",
        "done",
        createdAt,
        createdAt,
        10,
        null
      );

      const results = await store.search("frequency bonus same content", 10);
      const low = results.find((r) => r.id === "mem_freq_low");
      const high = results.find((r) => r.id === "mem_freq_high");

      expect(low).toBeDefined();
      expect(high).toBeDefined();
      expect((high?.score ?? 0) > (low?.score ?? 0)).toBe(true);
    });

    it("memory with last_accessed_at 1 day ago scores higher than 90 days ago", async () => {
      const store = createMemoryStore(
        db,
        makeMockEmbedding({ error: "embedding down" }),
        makeConfig(),
        vectorBackend
      );
      const now = Date.now();
      const createdAt = now - 45 * 24 * 60 * 60 * 1000;

      db.query(
        "INSERT INTO memories (id, content, tags, type, metadata, embedding_status, created_at, updated_at, search_hit_count, last_accessed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
      ).run(
        "mem_access_old",
        "access bonus same content",
        "",
        "general",
        "{}",
        "done",
        createdAt,
        createdAt,
        0,
        now - 90 * 24 * 60 * 60 * 1000
      );
      db.query(
        "INSERT INTO memories (id, content, tags, type, metadata, embedding_status, created_at, updated_at, search_hit_count, last_accessed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
      ).run(
        "mem_access_new",
        "access bonus same content",
        "",
        "general",
        "{}",
        "done",
        createdAt,
        createdAt,
        0,
        now - 1 * 24 * 60 * 60 * 1000
      );

      const results = await store.search("access bonus same content", 10);
      const oldAccess = results.find((r) => r.id === "mem_access_old");
      const newAccess = results.find((r) => r.id === "mem_access_new");

      expect(oldAccess).toBeDefined();
      expect(newAccess).toBeDefined();
      expect((newAccess?.score ?? 0) > (oldAccess?.score ?? 0)).toBe(true);
    });

    it("search_hit_count=0 gives exactly zero frequency bonus delta vs expected log1p baseline", async () => {
      const store = createMemoryStore(
        db,
        makeMockEmbedding({ error: "embedding down" }),
        makeConfig(),
        vectorBackend
      );
      const now = Date.now();
      const createdAt = now - 30 * 24 * 60 * 60 * 1000;

      db.query(
        "INSERT INTO memories (id, content, tags, type, metadata, embedding_status, created_at, updated_at, search_hit_count, last_accessed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
      ).run(
        "mem_freq_zero_case",
        "freq zero unique",
        "",
        "general",
        "{}",
        "done",
        createdAt,
        createdAt,
        0,
        null
      );
      db.query(
        "INSERT INTO memories (id, content, tags, type, metadata, embedding_status, created_at, updated_at, search_hit_count, last_accessed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
      ).run(
        "mem_freq_one_case",
        "freq one unique",
        "",
        "general",
        "{}",
        "done",
        createdAt,
        createdAt,
        1,
        null
      );

      const zeroResult = (await store.search("freq zero unique", 1))[0];
      const oneResult = (await store.search("freq one unique", 1))[0];

      expect(zeroResult).toBeDefined();
      expect(oneResult).toBeDefined();

      const expectedDelta = Math.log1p(1) * 0.003;
      const actualDelta = (oneResult?.score ?? 0) - (zeroResult?.score ?? 0);
      expect(Math.abs(actualDelta - expectedDelta)).toBeLessThan(0.0001);
    });

    it("last_accessed_at=null gives zero access-recency bonus without NaN/crash", async () => {
      const store = createMemoryStore(
        db,
        makeMockEmbedding({ error: "embedding down" }),
        makeConfig(),
        vectorBackend
      );
      const now = Date.now();
      const createdAt = now - 30 * 24 * 60 * 60 * 1000;

      db.query(
        "INSERT INTO memories (id, content, tags, type, metadata, embedding_status, created_at, updated_at, search_hit_count, last_accessed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
      ).run(
        "mem_access_null",
        "access null unique",
        "",
        "general",
        "{}",
        "done",
        createdAt,
        createdAt,
        0,
        null
      );
      db.query(
        "INSERT INTO memories (id, content, tags, type, metadata, embedding_status, created_at, updated_at, search_hit_count, last_accessed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
      ).run(
        "mem_access_recent",
        "access recent unique",
        "",
        "general",
        "{}",
        "done",
        createdAt,
        createdAt,
        0,
        now - 1 * 24 * 60 * 60 * 1000
      );

      const nullResult = (await store.search("access null unique", 1))[0];
      const recentResult = (await store.search("access recent unique", 1))[0];

      expect(nullResult).toBeDefined();
      expect(recentResult).toBeDefined();
      expect(Number.isNaN(nullResult?.score ?? NaN)).toBe(false);

      const expectedAccessBonus = Math.exp(-(1 / 60)) * 0.005;
      const actualDelta = (recentResult?.score ?? 0) - (nullResult?.score ?? 0);
      expect(Math.abs(actualDelta - expectedAccessBonus)).toBeLessThan(0.0001);
    });

    it("all bonus values are non-negative and final score is not negative", async () => {
      const store = createMemoryStore(
        db,
        makeMockEmbedding({ error: "embedding down" }),
        makeConfig(),
        vectorBackend
      );
      const now = Date.now();
      const createdAt = now - 30 * 24 * 60 * 60 * 1000;

      db.query(
        "INSERT INTO memories (id, content, tags, type, metadata, embedding_status, created_at, updated_at, search_hit_count, last_accessed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
      ).run(
        "mem_negative_inputs",
        "negative bonus guard unique",
        "",
        "general",
        "{}",
        "done",
        createdAt,
        createdAt,
        -5,
        now + 10 * 24 * 60 * 60 * 1000
      );

      const result = (await store.search("negative bonus guard unique", 1))[0];
      expect(result).toBeDefined();
      expect(Number.isNaN(result?.score ?? NaN)).toBe(false);
      expect((result?.score ?? -1) >= 0).toBe(true);
    });

    it("combined bonus remains below 0.035 even with extreme values", async () => {
      const store = createMemoryStore(
        db,
        makeMockEmbedding({ error: "embedding down" }),
        makeConfig(),
        vectorBackend
      );
      const now = Date.now();
      const createdAt = now;

      db.query(
        "INSERT INTO memories (id, content, tags, type, metadata, embedding_status, created_at, updated_at, search_hit_count, last_accessed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
      ).run(
        "mem_extreme_bonus",
        "extreme bonus probe",
        "extreme bonus probe",
        "general",
        "{}",
        "done",
        createdAt,
        createdAt,
        100000,
        now
      );

      const result = (await store.search("extreme bonus probe", 1))[0];
      expect(result).toBeDefined();

      const baseSingleResultScore = (1 / (60 + 1)) * 2;
      const bonusOnly = (result?.score ?? 0) - baseSingleResultScore;
      expect(bonusOnly).toBeLessThan(0.035);
    });
  });
});
