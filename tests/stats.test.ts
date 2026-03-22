import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import type { Database } from "bun:sqlite";
import type { Logger } from "../src/services/logger.js";
import { createDatabase, closeDatabase } from "../src/services/database.js";
import {
  runMigrations,
  hasColumn,
  type Migration,
} from "../src/services/migration-runner.js";
import { memoryMigrations } from "../src/services/migrations.js";
import { createMemoryTool } from "../src/services/tool.js";
import {
  makeConfig,
  makeMockStore,
  makeMockProfileStore,
  makeTestMemory,
} from "./helpers.js";

function createMockLogger(): Logger {
  return {
    debug: mock(() => {}),
    info: mock(() => {}),
    warn: mock(() => {}),
    error: mock(() => {}),
  };
}

describe("stats feature", () => {
  describe("migration - search_hit_count and last_accessed_at columns", () => {
    let db: Database;
    let logger: Logger;

    beforeEach(() => {
      db = createDatabase(":memory:", 1536);
      logger = createMockLogger();
    });

    afterEach(() => {
      closeDatabase(db);
    });

    it("migration v1 adds search_hit_count column to memories table", () => {
      runMigrations(db, memoryMigrations, logger);

      expect(hasColumn(db, "memories", "search_hit_count")).toBe(true);
    });

    it("migration v1 adds last_accessed_at column to memories table", () => {
      runMigrations(db, memoryMigrations, logger);

      expect(hasColumn(db, "memories", "last_accessed_at")).toBe(true);
    });

    it("migration v1 sets search_hit_count default to 0", () => {
      runMigrations(db, memoryMigrations, logger);

      db.run(
        `INSERT INTO memories (id, content, tags, type, metadata, embedding_status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        ["test_id", "test content", "test", "general", "{}", "done", Date.now(), Date.now()]
      );

      const result = db.query("SELECT search_hit_count FROM memories WHERE id = ?").get("test_id") as
        | { search_hit_count: number }
        | null;
      expect(result?.search_hit_count).toBe(0);
    });
  });

  describe("MemoryStore.getStats()", () => {
    it("returns stats object with correct structure", async () => {
      const store = makeMockStore();
      const stats = await (store as any).getStats();

      expect(stats).toBeDefined();
      expect(stats.total).toBeDefined();
      expect(stats.byType).toBeDefined();
      expect(stats.byEmbeddingStatus).toBeDefined();
      expect(stats.oldest).toBeDefined();
      expect(stats.newest).toBeDefined();
    });

    it("returns total: 0 when store is empty", async () => {
      const store = makeMockStore();
      (store as any).getStats = mock(async () => ({
        total: 0,
        byType: {},
        byEmbeddingStatus: {},
        oldest: null,
        newest: null,
      }));

      const stats = await (store as any).getStats();
      expect(stats.total).toBe(0);
    });

    it("returns correct byType counts for mixed types", async () => {
      const store = makeMockStore();
      (store as any).getStats = mock(async () => ({
        total: 3,
        byType: {
          general: 2,
          decision: 1,
        },
        byEmbeddingStatus: { done: 3 },
        oldest: { createdAt: 1000 },
        newest: { createdAt: 3000 },
      }));

      const stats = await (store as any).getStats();
      expect(stats.byType.general).toBe(2);
      expect(stats.byType.decision).toBe(1);
    });

    it("returns correct byEmbeddingStatus counts", async () => {
      const store = makeMockStore();
      (store as any).getStats = mock(async () => ({
        total: 4,
        byType: { general: 4 },
        byEmbeddingStatus: { done: 3, pending: 1 },
        oldest: { createdAt: 1000 },
        newest: { createdAt: 4000 },
      }));

      const stats = await (store as any).getStats();
      expect(stats.byEmbeddingStatus.done).toBe(3);
      expect(stats.byEmbeddingStatus.pending).toBe(1);
    });

    it("returns oldest and newest memory objects", async () => {
      const store = makeMockStore();
      const oldMemory = makeTestMemory({ id: "old", createdAt: 1000 });
      const newMemory = makeTestMemory({ id: "new", createdAt: 5000 });

      (store as any).getStats = mock(async () => ({
        total: 2,
        byType: { general: 2 },
        byEmbeddingStatus: { done: 2 },
        oldest: oldMemory,
        newest: newMemory,
      }));

      const stats = await (store as any).getStats();
      expect(stats.oldest?.id).toBe("old");
      expect(stats.newest?.id).toBe("new");
    });
  });

  describe("tool mode=stats", () => {
    it("stats mode returns a string containing stats info", async () => {
      const store = makeMockStore();
      (store as any).getStats = mock(async () => ({
        total: 5,
        byType: { general: 3, decision: 2 },
        byEmbeddingStatus: { done: 5 },
        oldest: makeTestMemory({ id: "oldest", createdAt: 1000 }),
        newest: makeTestMemory({ id: "newest", createdAt: 5000 }),
      }));

      const toolDef = createMemoryTool(
        store,
        makeConfig({ searchLimit: 5, contextLimit: 3 }),
        {
          profileStore: makeMockProfileStore(),
          profileExtractor: { extract: mock(async () => {}) },
          onWebStart: mock(() => "http://localhost:18080"),
        }
      );

      const result = await (toolDef as any).execute(
        { mode: "stats" },
        { sessionID: "test-session" }
      );

      expect(result).toBeString();
      expect(result.length).toBeGreaterThan(0);
    });

    it("stats mode calls store.getStats() not store.list()", async () => {
      const store = makeMockStore();
      const getStatsMock = mock(async () => ({
        total: 0,
        byType: {},
        byEmbeddingStatus: {},
        oldest: null,
        newest: null,
      }));
      (store as any).getStats = getStatsMock;

      const toolDef = createMemoryTool(
        store,
        makeConfig({ searchLimit: 5, contextLimit: 3 }),
        {
          profileStore: makeMockProfileStore(),
          profileExtractor: { extract: mock(async () => {}) },
          onWebStart: mock(() => "http://localhost:18080"),
        }
      );

      await (toolDef as any).execute(
        { mode: "stats" },
        { sessionID: "test-session" }
      );

      expect(getStatsMock).toHaveBeenCalled();
      expect((store.list as any).mock?.callCount ?? 0).toBe(0);
    });

    it("stats mode returns formatted output with memory counts", async () => {
      const store = makeMockStore();
      (store as any).getStats = mock(async () => ({
        total: 10,
        byType: { general: 6, decision: 3, preference: 1 },
        byEmbeddingStatus: { done: 9, pending: 1 },
        oldest: makeTestMemory({ id: "old", createdAt: 1000 }),
        newest: makeTestMemory({ id: "new", createdAt: 5000 }),
      }));

      const toolDef = createMemoryTool(
        store,
        makeConfig({ searchLimit: 5, contextLimit: 3 }),
        {
          profileStore: makeMockProfileStore(),
          profileExtractor: { extract: mock(async () => {}) },
          onWebStart: mock(() => "http://localhost:18080"),
        }
      );

      const result = await (toolDef as any).execute(
        { mode: "stats" },
        { sessionID: "test-session" }
      );

      expect(result.toLowerCase()).toContain("total");
      expect(result.toLowerCase()).toContain("10");
    });
  });

  describe("MemoryStore.recordSearchHit(ids: string[])", () => {
    it("recordSearchHit resolves successfully", async () => {
      const store = makeMockStore();
      const result = await (store as any).recordSearchHit(["id1", "id2"]);
      expect(result).toBeUndefined();
    });

    it("recordSearchHit accepts array of memory IDs", async () => {
      const store = makeMockStore();
      const recordMock = mock(async () => {});
      (store as any).recordSearchHit = recordMock;

      await (store as any).recordSearchHit(["mem_123", "mem_456"]);

      expect(recordMock).toHaveBeenCalledWith(["mem_123", "mem_456"]);
    });

    it("recordSearchHit can be called with empty array", async () => {
      const store = makeMockStore();
      const recordMock = mock(async () => {});
      (store as any).recordSearchHit = recordMock;

      await (store as any).recordSearchHit([]);

      expect(recordMock).toHaveBeenCalledWith([]);
    });
  });

  describe("type validation in add mode", () => {
    it("add mode with valid type 'decision' succeeds", async () => {
      const store = makeMockStore();
      const testMemory = makeTestMemory({ id: "test_123", type: "decision" });
      (store.add as any).mockImplementation(async () => testMemory);

      const toolDef = createMemoryTool(
        store,
        makeConfig({ searchLimit: 5, contextLimit: 3 }),
        {
          profileStore: makeMockProfileStore(),
          profileExtractor: { extract: mock(async () => {}) },
          onWebStart: mock(() => "http://localhost:18080"),
        }
      );

      const result = await (toolDef as any).execute(
        { mode: "add", content: "test content", type: "decision" },
        { sessionID: "test-session" }
      );

      expect(result).toContain("test_123");
      expect((store.add as any).mock?.callCount ?? 1).toBeGreaterThan(0);
    });

    it("add mode with invalid type 'banana' returns error", async () => {
      const store = makeMockStore();

      const toolDef = createMemoryTool(
        store,
        makeConfig({ searchLimit: 5, contextLimit: 3 }),
        {
          profileStore: makeMockProfileStore(),
          profileExtractor: { extract: mock(async () => {}) },
          onWebStart: mock(() => "http://localhost:18080"),
        }
      );

      const result = await (toolDef as any).execute(
        { mode: "add", content: "test content", type: "banana" },
        { sessionID: "test-session" }
      );

      expect(result.toLowerCase()).toContain("error");
      expect(result.toLowerCase()).toContain("invalid");
    });

    it("add mode without type defaults to 'general'", async () => {
      const store = makeMockStore();
      const testMemory = makeTestMemory({ id: "test_456", type: "general" });
      (store.add as any).mockImplementation(async () => testMemory);

      const toolDef = createMemoryTool(
        store,
        makeConfig({ searchLimit: 5, contextLimit: 3 }),
        {
          profileStore: makeMockProfileStore(),
          profileExtractor: { extract: mock(async () => {}) },
          onWebStart: mock(() => "http://localhost:18080"),
        }
      );

      const result = await (toolDef as any).execute(
        { mode: "add", content: "test content" },
        { sessionID: "test-session" }
      );

      expect(result).toContain("test_456");
    });

    it("add mode with valid type 'preference' succeeds", async () => {
      const store = makeMockStore();
      const testMemory = makeTestMemory({ id: "test_789", type: "preference" });
      (store.add as any).mockImplementation(async () => testMemory);

      const toolDef = createMemoryTool(
        store,
        makeConfig({ searchLimit: 5, contextLimit: 3 }),
        {
          profileStore: makeMockProfileStore(),
          profileExtractor: { extract: mock(async () => {}) },
          onWebStart: mock(() => "http://localhost:18080"),
        }
      );

      const result = await (toolDef as any).execute(
        { mode: "add", content: "test content", type: "preference" },
        { sessionID: "test-session" }
      );

      expect(result).toContain("test_789");
    });

    it("add mode with valid type 'bug-fix' succeeds", async () => {
      const store = makeMockStore();
      const testMemory = makeTestMemory({ id: "test_101", type: "bug-fix" });
      (store.add as any).mockImplementation(async () => testMemory);

      const toolDef = createMemoryTool(
        store,
        makeConfig({ searchLimit: 5, contextLimit: 3 }),
        {
          profileStore: makeMockProfileStore(),
          profileExtractor: { extract: mock(async () => {}) },
          onWebStart: mock(() => "http://localhost:18080"),
        }
      );

      const result = await (toolDef as any).execute(
        { mode: "add", content: "test content", type: "bug-fix" },
        { sessionID: "test-session" }
      );

      expect(result).toContain("test_101");
    });
  });
});
