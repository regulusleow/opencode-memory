import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import type { Database } from "bun:sqlite";
import { generateMemoryId } from "../src/config.js";
import { createDatabase, closeDatabase } from "../src/services/database.js";
import { createMemoryStore } from "../src/services/memory-store.js";
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
  };
}

describe("MemoryStore", () => {
  let db: Database;

  beforeEach(() => {
    db = createDatabase(":memory:", 3);
  });

  afterEach(() => {
    closeDatabase(db);
  });

  it("add() stores memory and returns it with generated ID", async () => {
    const store = createMemoryStore(
      db,
      makeMockEmbedding({ error: "embed unavailable" }),
      makeConfig()
    );

    const added = await store.add("first memory", {
      tags: "ios,objc",
      type: "note",
      metadata: { source: "test" },
    });

    expect(added.id).toMatch(/^mem_/);
    expect(added.content).toBe("first memory");
    expect(added.tags).toBe("ios,objc");
    expect(added.type).toBe("note");
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
      makeConfig()
    );

    const added = await store.add("vector memory");

    expect(added.embeddingStatus).toBe("done");

    const vectorRow = db
      .query("SELECT id FROM memory_vectors WHERE id = ?")
      .get(added.id) as { id: string } | null;
    expect(vectorRow?.id).toBe(added.id);
  });

  it("add() with failed embedding keeps pending status", async () => {
    const store = createMemoryStore(
      db,
      makeMockEmbedding({ error: "network failed" }),
      makeConfig()
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
    const store = createMemoryStore(db, service, makeConfig());

    const added = await store.add("find me by vector", { tags: "vector" });
    const results = await store.search("find query");

    expect(results.length).toBeGreaterThan(0);
    expect(results[0]?.id).toBe(added.id);
    expect(results[0]?.score).toBeGreaterThan(0);
  });

  it("search() falls back to text search when embed fails", async () => {
    const service = makeMockEmbedding({ error: "embedding down" });
    const store = createMemoryStore(db, service, makeConfig());

    const added = await store.add("objc architecture decision", {
      tags: "ios,objc",
    });
    const results = await store.search("architecture");

    expect(results.length).toBe(1);
    expect(results[0]?.id).toBe(added.id);
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
    const store = createMemoryStore(db, service, makeConfig());

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
      makeConfig()
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
      makeConfig()
    );
    const list = await store.list(1, 1);

    expect(list.length).toBe(1);
    expect(list[0]?.id).toBe("mem_1");
  });

  it("forget() removes from both memories and vectors tables", async () => {
    const store = createMemoryStore(
      db,
      makeMockEmbedding({ embedding: new Float64Array([0.7, 0.1, 0.1]) }),
      makeConfig()
    );

    const added = await store.add("delete me");
    const removed = await store.forget(added.id);

    expect(removed).toBe(true);

    const memoryRow = db.query("SELECT id FROM memories WHERE id = ?").get(added.id);
    const vectorRow = db
      .query("SELECT id FROM memory_vectors WHERE id = ?")
      .get(added.id);
    expect(memoryRow).toBeNull();
    expect(vectorRow).toBeNull();
  });

  it("forget() returns false for non-existent ID", async () => {
    const store = createMemoryStore(
      db,
      makeMockEmbedding({ error: "unused" }),
      makeConfig()
    );

    const removed = await store.forget("mem_missing");
    expect(removed).toBe(false);
  });

  it("get() returns memory by ID", async () => {
    const store = createMemoryStore(
      db,
      makeMockEmbedding({ error: "unused" }),
      makeConfig()
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
      makeConfig()
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
    const store = createMemoryStore(db, service, makeConfig());

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
    const store = createMemoryStore(db, service, makeConfig());

    const count = await store.retryPendingEmbeddings();
    expect(count).toBe(0);

    const row = db
      .query("SELECT embedding_status FROM memories WHERE id = ?")
      .get("mem_fail") as { embedding_status: string };
    expect(row.embedding_status).toBe("failed");
  });

  it("uses bun:test mock utility in assertions", () => {
    const fn = mock((v: string) => v.toUpperCase());
    expect(fn("ok")).toBe("OK");
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
