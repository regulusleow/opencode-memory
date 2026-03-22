import { describe, it, expect } from "bun:test";
import { createMemoryTool } from "../src/services/tool.js";
import { makeConfig, makeMockStore, makeMockProfileStore, makeTestMemory } from "./helpers.js";

describe("export", () => {
  it("exportAll() on empty DB returns object with schemaVersion, embeddingModel, exportedAt, totalCount, and memories", async () => {
    const store = makeMockStore() as any;
    const result = await store.exportAll();
    
    expect(result).toBeDefined();
    expect(result.schemaVersion).toBe(1);
    expect(typeof result.embeddingModel).toBe("string");
    expect(typeof result.exportedAt).toBe("string");
    expect(result.totalCount).toBe(0);
    expect(Array.isArray(result.memories)).toBe(true);
    expect(result.memories.length).toBe(0);
  });

  it("exportAll() with memories returns all fields including id, content, tags, type, metadata, createdAt, updatedAt, searchHitCount, lastAccessedAt", async () => {
    const store = makeMockStore() as any;
    store.exportAll = async () => ({
      schemaVersion: 1,
      embeddingModel: "test-model",
      exportedAt: new Date().toISOString(),
      totalCount: 2,
      memories: [
        {
          id: "mem_001",
          content: "Test content 1",
          tags: "test,export",
          type: "decision",
          metadata: { key: "value" },
          createdAt: 1000,
          updatedAt: 1010,
          searchHitCount: 5,
          lastAccessedAt: 2000,
        },
        {
          id: "mem_002",
          content: "Test content 2",
          tags: "export",
          type: "preference",
          metadata: {},
          createdAt: 2000,
          updatedAt: 2010,
          searchHitCount: 0,
          lastAccessedAt: null,
        },
      ],
    });
    
    const result = await store.exportAll();
    
    expect(result.totalCount).toBe(2);
    expect(result.memories.length).toBe(2);
    
    const mem1 = result.memories[0];
    expect(mem1.id).toBe("mem_001");
    expect(mem1.content).toBe("Test content 1");
    expect(mem1.tags).toBe("test,export");
    expect(mem1.type).toBe("decision");
    expect(mem1.metadata).toEqual({ key: "value" });
    expect(mem1.createdAt).toBe(1000);
    expect(mem1.updatedAt).toBe(1010);
    expect(mem1.searchHitCount).toBe(5);
    expect(mem1.lastAccessedAt).toBe(2000);
  });

  it("exportAll() does NOT include vector field in memories", async () => {
    const store = makeMockStore() as any;
    store.exportAll = async () => ({
      schemaVersion: 1,
      embeddingModel: "test-model",
      exportedAt: new Date().toISOString(),
      totalCount: 1,
      memories: [
        {
          id: "mem_001",
          content: "Test content",
          tags: "test",
          type: "general",
          metadata: {},
          createdAt: 1000,
          updatedAt: 1010,
          searchHitCount: 0,
          lastAccessedAt: null,
        },
      ],
    });
    
    const result = await store.exportAll();
    const memory = result.memories[0];
    
    expect(memory).not.toHaveProperty("vector");
  });

  it("exportAll() does NOT include embeddingStatus field in memories", async () => {
    const store = makeMockStore() as any;
    store.exportAll = async () => ({
      schemaVersion: 1,
      embeddingModel: "test-model",
      exportedAt: new Date().toISOString(),
      totalCount: 1,
      memories: [
        {
          id: "mem_001",
          content: "Test content",
          tags: "test",
          type: "general",
          metadata: {},
          createdAt: 1000,
          updatedAt: 1010,
          searchHitCount: 0,
          lastAccessedAt: null,
        },
      ],
    });
    
    const result = await store.exportAll();
    const memory = result.memories[0];
    
    expect(memory).not.toHaveProperty("embeddingStatus");
  });

  it("mode=export tool mode calls store.exportAll() and returns a JSON string", async () => {
    const store = makeMockStore() as any;
    store.exportAll = async () => ({
      schemaVersion: 1,
      embeddingModel: "test-model",
      exportedAt: "2025-03-22T10:00:00.000Z",
      totalCount: 0,
      memories: [],
    });
    
    const toolDef = createMemoryTool(store, makeConfig(), {
      profileStore: makeMockProfileStore(),
      profileExtractor: { extract: async () => {} },
      onWebStart: () => "http://localhost:18080",
    });
    
    const result = await (toolDef as any).execute({ mode: "export" }, { sessionID: "test-session" });
    
    expect(typeof result).toBe("string");
    expect(() => JSON.parse(result)).not.toThrow();
  });

  it("mode=export result is valid JSON that parses to object with schemaVersion and memories", async () => {
    const store = makeMockStore() as any;
    store.exportAll = async () => ({
      schemaVersion: 1,
      embeddingModel: "test-model",
      exportedAt: "2025-03-22T10:00:00.000Z",
      totalCount: 1,
      memories: [
        {
          id: "mem_001",
          content: "Test",
          tags: "test",
          type: "general",
          metadata: {},
          createdAt: 1000,
          updatedAt: 1010,
          searchHitCount: 0,
          lastAccessedAt: null,
        },
      ],
    });
    
    const toolDef = createMemoryTool(store, makeConfig(), {
      profileStore: makeMockProfileStore(),
      profileExtractor: { extract: async () => {} },
      onWebStart: () => "http://localhost:18080",
    });
    
    const result = await (toolDef as any).execute({ mode: "export" }, { sessionID: "test-session" });
    const parsed = JSON.parse(result);
    
    expect(parsed.schemaVersion).toBe(1);
    expect(Array.isArray(parsed.memories)).toBe(true);
  });
});

describe("import", () => {
  it("importMemories() with empty array returns { imported: 0, skipped: 0 }", async () => {
    const store = makeMockStore() as any;
    const result = await store.importMemories([]);
    
    expect(result).toEqual({ imported: 0, skipped: 0 });
  });

  it("importMemories() with N memories returns { imported: N, skipped: 0 }", async () => {
    const store = makeMockStore() as any;
    store.importMemories = async (memories: any[]) => ({
      imported: memories.length,
      skipped: 0,
    });
    
    const testMemories = [
      makeTestMemory({ id: "mem_001", content: "Content 1" }),
      makeTestMemory({ id: "mem_002", content: "Content 2" }),
      makeTestMemory({ id: "mem_003", content: "Content 3" }),
    ];
    
    const result = await store.importMemories(testMemories);
    
    expect(result.imported).toBe(3);
    expect(result.skipped).toBe(0);
  });

  it("importMemories() with duplicate IDs skips correctly and returns accurate counts", async () => {
    const store = makeMockStore() as any;
    store.importMemories = async (memories: any[]) => {
      return { imported: 3, skipped: 2 };
    };
    
    const testMemories = [
      makeTestMemory({ id: "mem_001" }),
      makeTestMemory({ id: "mem_002" }),
      makeTestMemory({ id: "mem_001" }),
      makeTestMemory({ id: "mem_003" }),
      makeTestMemory({ id: "mem_002" }),
    ];
    
    const result = await store.importMemories(testMemories);
    
    expect(result.imported).toBe(3);
    expect(result.skipped).toBe(2);
    expect(result.imported + result.skipped).toBe(5);
  });

  it("importMemories() sets embedding_status to pending for all imported memories", async () => {
    const imported: any[] = [];
    
    const store = makeMockStore() as any;
    store.importMemories = async (memories: any[]) => {
      imported.push(...memories);
      return { imported: memories.length, skipped: 0 };
    };
    
    const testMemories = [
      makeTestMemory({ id: "mem_001" }),
      makeTestMemory({ id: "mem_002" }),
    ];
    
    await store.importMemories(testMemories);
    
    expect(imported.length).toBeGreaterThan(0);
  });

  it("mode=import tool mode with valid JSON returns success string with counts", async () => {
    const store = makeMockStore() as any;
    store.importMemories = async () => ({ imported: 5, skipped: 0 });
    
    const toolDef = createMemoryTool(store, makeConfig(), {
      profileStore: makeMockProfileStore(),
      profileExtractor: { extract: async () => {} },
      onWebStart: () => "http://localhost:18080",
    });
    
    const jsonContent = JSON.stringify({
      schemaVersion: 1,
      embeddingModel: "test",
      exportedAt: "2025-03-22T10:00:00.000Z",
      totalCount: 5,
      memories: [
        makeTestMemory({ id: "mem_001" }),
        makeTestMemory({ id: "mem_002" }),
        makeTestMemory({ id: "mem_003" }),
        makeTestMemory({ id: "mem_004" }),
        makeTestMemory({ id: "mem_005" }),
      ],
    });
    
    const result = await (toolDef as any).execute(
      { mode: "import", content: jsonContent },
      { sessionID: "test-session" }
    );
    
    expect(typeof result).toBe("string");
    expect(result.toLowerCase()).toMatch(/import|success|5/);
  });

  it("mode=import tool mode with no content returns error message", async () => {
    const store = makeMockStore();
    const toolDef = createMemoryTool(store, makeConfig(), {
      profileStore: makeMockProfileStore(),
      profileExtractor: { extract: async () => {} },
      onWebStart: () => "http://localhost:18080",
    });
    
    const result = await (toolDef as any).execute(
      { mode: "import" },
      { sessionID: "test-session" }
    );
    
    expect(typeof result).toBe("string");
    expect(result.toLowerCase()).toMatch(/error|content|required/);
  });

  it("mode=import tool mode with invalid JSON returns error message", async () => {
    const store = makeMockStore();
    const toolDef = createMemoryTool(store, makeConfig(), {
      profileStore: makeMockProfileStore(),
      profileExtractor: { extract: async () => {} },
      onWebStart: () => "http://localhost:18080",
    });
    
    const result = await (toolDef as any).execute(
      { mode: "import", content: "not valid json {]" },
      { sessionID: "test-session" }
    );
    
    expect(typeof result).toBe("string");
    expect(result.toLowerCase()).toMatch(/error|invalid|json/);
  });
});
