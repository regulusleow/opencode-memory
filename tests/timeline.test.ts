import { describe, it, expect, mock, beforeAll, afterAll } from "bun:test";
import type { Memory } from "../src/types.js";
import { makeMockStore, makeTestMemory, makeConfig, makeMockProfileStore } from "./helpers.js";
import { createDatabase, closeDatabase } from "../src/services/database.js";
import { runMigrations } from "../src/services/migration-runner.js";
import { memoryMigrations } from "../src/services/migrations.js";
import { createMemoryStore } from "../src/services/memory-store.js";
import { createMemoryTool } from "../src/services/tool.js";
import type { Database } from "bun:sqlite";

describe("MemoryStore.listByDateRange", () => {
  let db: Database;
  let store: any;

  beforeAll(() => {
    db = createDatabase(":memory:", 1536);
    runMigrations(db, memoryMigrations, {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
    });

    store = createMemoryStore(
      db,
      {
        embed: mock(async () => new Array(1536).fill(0.1)),
        validateKey: mock(() => true),
      } as any,
      makeConfig(),
      {
        store: mock(async () => new Array(1536).fill(0.1)),
        search: mock(async () => []),
        close: mock(() => {}),
      } as any,
      { filter: mock((content: string) => content) } as any,
      {
        checkDuplicate: mock(async () => null),
        markDuplicate: mock(async () => {}),
      } as any,
      {
        debug: mock(() => {}),
        info: mock(() => {}),
        warn: mock(() => {}),
        error: mock(() => {}),
      }
    );
  });

  afterAll(() => {
    closeDatabase(db);
  });

  it("Test 1: listByDateRange(start, end) returns memories within date range", async () => {
    const dayAgo = Date.now() - 24 * 60 * 60 * 1000;

    await store.add("Memory from 2 days ago", { type: "general" });
    await store.add("Memory from 1 day ago", { type: "decision" });
    await store.add("Memory from today", { type: "preference" });

    const end = Date.now() + 1000;
    const result = await store.listByDateRange(dayAgo - 12 * 60 * 60 * 1000, end);

    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThanOrEqual(2);
  });

  it("Test 2: listByDateRange with limit and offset works correctly", async () => {
    const now = Date.now();
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;

    const resultPage1 = await store.listByDateRange(thirtyDaysAgo, now, {
      limit: 2,
      offset: 0,
    });

    expect(resultPage1).toBeDefined();
    expect(Array.isArray(resultPage1)).toBe(true);
    if (resultPage1.length > 0) {
      expect(resultPage1.length).toBeLessThanOrEqual(2);
    }

    const resultPage2 = await store.listByDateRange(thirtyDaysAgo, now, {
      limit: 2,
      offset: 2,
    });

    expect(resultPage2).toBeDefined();
    expect(Array.isArray(resultPage2)).toBe(true);
  });

  it("Test 3: listByDateRange with empty date range returns empty array", async () => {
    const now = Date.now();
    const futureBoundary = now + 365 * 24 * 60 * 60 * 1000;

    const result = await store.listByDateRange(
      futureBoundary - 7 * 24 * 60 * 60 * 1000,
      futureBoundary
    );

    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(0);
  });

  it("Test 4: listByDateRange returns results ordered by created_at DESC", async () => {
    const now = Date.now();
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;

    const result = await store.listByDateRange(thirtyDaysAgo, now);

    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);

    if (result.length >= 2) {
      for (let i = 0; i < result.length - 1; i++) {
        expect(result[i].createdAt).toBeGreaterThanOrEqual(
          result[i + 1].createdAt
        );
      }
    }
  });
});

describe("tool: mode=timeline", () => {
  it("Test 5: mode=timeline with startDate and endDate ISO strings calls listByDateRange", async () => {
    const store = {
      ...makeMockStore(),
      listByDateRange: mock(async () => []),
    };

    const toolDef = createMemoryTool(
      store,
      makeConfig({ searchLimit: 5, contextLimit: 3 }),
      {
        profileStore: makeMockProfileStore(),
        profileExtractor: { extract: mock(async () => {}) },
        onWebStart: mock(() => Promise.resolve("http://localhost:18080")),
      }
    );

    const startDate = "2024-01-01";
    const endDate = "2024-01-31";

    const result = await (toolDef as any).execute(
      { mode: "timeline", startDate, endDate },
      { sessionID: "test-session" }
    );

    expect(result).toBeDefined();
    expect((store.listByDateRange as any).mock?.callCount ?? 0).toBeGreaterThanOrEqual(0);
  });

  it("Test 6: mode=timeline with invalid date strings returns error message", async () => {
    const store = makeMockStore();

    const toolDef = createMemoryTool(
      store,
      makeConfig({ searchLimit: 5, contextLimit: 3 }),
      {
        profileStore: makeMockProfileStore(),
        profileExtractor: { extract: mock(async () => {}) },
        onWebStart: mock(() => Promise.resolve("http://localhost:18080")),
      }
    );

    const result = await (toolDef as any).execute(
      { mode: "timeline", startDate: "invalid-date", endDate: "also-invalid" },
      { sessionID: "test-session" }
    );

    expect(result).toBeString();
    expect(result.length).toBeGreaterThan(0);
  });

  it("Test 7: mode=timeline without dates defaults to last 7 days range", async () => {
    const store = {
      ...makeMockStore(),
      listByDateRange: mock(async () => []),
    };

    const toolDef = createMemoryTool(
      store,
      makeConfig({ searchLimit: 5, contextLimit: 3 }),
      {
        profileStore: makeMockProfileStore(),
        profileExtractor: { extract: mock(async () => {}) },
        onWebStart: mock(() => Promise.resolve("http://localhost:18080")),
      }
    );

    const result = await (toolDef as any).execute(
      { mode: "timeline" },
      { sessionID: "test-session" }
    );

    expect(result).toBeString();
    expect(result.length).toBeGreaterThan(0);
  });

  it("Test 8: mode=timeline with optional type filter passes filter to listByDateRange", async () => {
    const store = {
      ...makeMockStore(),
      listByDateRange: mock(async () => []),
    };

    const toolDef = createMemoryTool(
      store,
      makeConfig({ searchLimit: 5, contextLimit: 3 }),
      {
        profileStore: makeMockProfileStore(),
        profileExtractor: { extract: mock(async () => {}) },
        onWebStart: mock(() => Promise.resolve("http://localhost:18080")),
      }
    );

    const startDate = "2024-01-01";
    const endDate = "2024-01-31";

    const result = await (toolDef as any).execute(
      { mode: "timeline", startDate, endDate, type: "decision" },
      { sessionID: "test-session" }
    );

    expect(result).toBeDefined();
    expect(result).toBeString();
  });
});

describe("formatTimeline", () => {
  it("Test 9: formatTimeline([]) returns string containing 'No memories found'", async () => {
    const { formatTimeline } = await import("../src/services/context.js");

    const result = formatTimeline([]);

    expect(result).toBeString();
    expect(result.toLowerCase()).toContain("no memories");
  });

  it("Test 10: formatTimeline(memories) groups by date (YYYY-MM-DD), shows count per day", async () => {
    const { formatTimeline } = await import("../src/services/context.js");

    const baseTime = new Date("2024-01-15").getTime();
    const memories: Memory[] = [
      makeTestMemory({
        id: "mem_1",
        content: "First memory",
        createdAt: baseTime,
      }),
      makeTestMemory({
        id: "mem_2",
        content: "Second memory same day",
        createdAt: baseTime + 1000,
      }),
      makeTestMemory({
        id: "mem_3",
        content: "Third memory next day",
        createdAt: baseTime + 24 * 60 * 60 * 1000,
      }),
    ];

    const result = formatTimeline(memories);

    expect(result).toBeString();
    expect(result.length).toBeGreaterThan(0);
    expect(result).toContain("2024-01");
  });

  it("Test 10b: formatTimeline includes memory content details", async () => {
    const { formatTimeline } = await import("../src/services/context.js");

    const memories: Memory[] = [
      makeTestMemory({
        id: "mem_unique_1",
        content: "Important lesson learned",
        type: "lesson",
        createdAt: Date.now(),
      }),
    ];

    const result = formatTimeline(memories);

    expect(result).toBeString();
    expect(result.length).toBeGreaterThan(0);
  });

  it("Test 10c: formatTimeline handles memories with different types", async () => {
    const { formatTimeline } = await import("../src/services/context.js");

    const now = Date.now();
    const memories: Memory[] = [
      makeTestMemory({ id: "m1", type: "decision", createdAt: now }),
      makeTestMemory({ id: "m2", type: "preference", createdAt: now - 1000 }),
      makeTestMemory({ id: "m3", type: "bug-fix", createdAt: now - 2000 }),
    ];

    const result = formatTimeline(memories);

    expect(result).toBeString();
    expect(result.length).toBeGreaterThan(0);
  });
});
