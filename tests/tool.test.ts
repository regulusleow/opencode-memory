import { describe, it, expect, mock } from "bun:test";
import { createMemoryTool } from "../src/services/tool.js";
import type { MemoryStore } from "../src/services/memory-store.js";
import type { PluginConfig, Memory, MemorySearchResult } from "../src/types.js";

function makeMockStore(): MemoryStore {
  return {
    add: mock(
      async (): Promise<Memory> => ({
        id: "mem_123",
        content: "test",
        tags: "",
        type: "general",
        metadata: {},
        embeddingStatus: "done",
        createdAt: 1000,
        updatedAt: 1000,
      })
    ),
    search: mock(async (): Promise<MemorySearchResult[]> => []),
    list: mock(async (): Promise<Memory[]> => []),
    forget: mock(async (): Promise<boolean> => true),
    get: mock(async (): Promise<Memory | null> => null),
    retryPendingEmbeddings: mock(async (): Promise<number> => 0),
  };
}

const mockConfig: PluginConfig = {
  embeddingApiUrl: "",
  embeddingApiKey: "",
  embeddingModel: "",
  embeddingDimensions: 1536,
  storagePath: "",
  searchLimit: 5,
  contextLimit: 3,
};

describe("createMemoryTool", () => {
  it("returned tool has a description string property", () => {
    const toolDef = createMemoryTool(makeMockStore(), mockConfig);
    expect((toolDef as any).description).toBeString();
    expect((toolDef as any).description.length).toBeGreaterThan(0);
  });

  it("returned tool has args with 7 fields", () => {
    const toolDef = createMemoryTool(makeMockStore(), mockConfig);
    const args = (toolDef as any).args;
    expect(args).toBeDefined();
    const keys = Object.keys(args);
    expect(keys).toContain("mode");
    expect(keys).toContain("content");
    expect(keys).toContain("query");
    expect(keys).toContain("tags");
    expect(keys).toContain("type");
    expect(keys).toContain("memoryId");
    expect(keys).toContain("limit");
    expect(keys.length).toBe(7);
  });

  it("add mode with content returns confirmation string with memory ID", async () => {
    const store = makeMockStore();
    const toolDef = createMemoryTool(store, mockConfig);
    const result = await (toolDef as any).execute(
      { mode: "add", content: "hello world" },
      { sessionID: "ses_test" }
    );
    expect(result).toContain("mem_123");
    expect(store.add).toHaveBeenCalledTimes(1);
  });

  it("add mode without content returns error mentioning content", async () => {
    const toolDef = createMemoryTool(makeMockStore(), mockConfig);
    const result = await (toolDef as any).execute(
      { mode: "add" },
      { sessionID: "ses_test" }
    );
    expect(result.toLowerCase()).toContain("content");
  });

  it("search mode with query calls store.search and returns formatted string", async () => {
    const store = makeMockStore();
    (store.search as any).mockImplementation(
      async (): Promise<MemorySearchResult[]> => [
        {
          id: "mem_001",
          content: "matching result",
          tags: "test",
          type: "note",
          metadata: {},
          embeddingStatus: "done",
          createdAt: 1700000000000,
          updatedAt: 1700000000000,
          score: 0.85,
          distance: 0.15,
        },
      ]
    );
    const toolDef = createMemoryTool(store, mockConfig);
    const result = await (toolDef as any).execute(
      { mode: "search", query: "matching" },
      { sessionID: "ses_test" }
    );
    expect(store.search).toHaveBeenCalledTimes(1);
    expect(result).toContain("matching result");
  });

  it("search mode without query returns error mentioning query", async () => {
    const toolDef = createMemoryTool(makeMockStore(), mockConfig);
    const result = await (toolDef as any).execute(
      { mode: "search" },
      { sessionID: "ses_test" }
    );
    expect(result.toLowerCase()).toContain("query");
  });

  it("list mode calls store.list and returns formatted string", async () => {
    const store = makeMockStore();
    (store.list as any).mockImplementation(
      async (): Promise<Memory[]> => [
        {
          id: "mem_abc",
          content: "listed memory content here",
          tags: "tag1",
          type: "general",
          metadata: {},
          embeddingStatus: "done",
          createdAt: 1700000000000,
          updatedAt: 1700000000000,
        },
      ]
    );
    const toolDef = createMemoryTool(store, mockConfig);
    const result = await (toolDef as any).execute(
      { mode: "list" },
      { sessionID: "ses_test" }
    );
    expect(store.list).toHaveBeenCalledTimes(1);
    expect(result).toContain("mem_abc");
    expect(result).toContain("listed memory content here");
  });

  it("forget mode with valid memoryId returns success message", async () => {
    const store = makeMockStore();
    const toolDef = createMemoryTool(store, mockConfig);
    const result = await (toolDef as any).execute(
      { mode: "forget", memoryId: "mem_123" },
      { sessionID: "ses_test" }
    );
    expect(store.forget).toHaveBeenCalledTimes(1);
    expect(result.toLowerCase()).toMatch(/delet|remov|forgot|success/);
  });

  it("forget mode with invalid memoryId returns not-found message", async () => {
    const store = makeMockStore();
    (store.forget as any).mockImplementation(async () => false);
    const toolDef = createMemoryTool(store, mockConfig);
    const result = await (toolDef as any).execute(
      { mode: "forget", memoryId: "mem_nonexistent" },
      { sessionID: "ses_test" }
    );
    expect(result.toLowerCase()).toMatch(/not found|no memory|does not exist/);
  });

  it("forget mode without memoryId returns error mentioning memoryId", async () => {
    const toolDef = createMemoryTool(makeMockStore(), mockConfig);
    const result = await (toolDef as any).execute(
      { mode: "forget" },
      { sessionID: "ses_test" }
    );
    expect(result.toLowerCase()).toContain("memoryid");
  });

  it("help mode returns non-empty string mentioning all 5 modes", async () => {
    const toolDef = createMemoryTool(makeMockStore(), mockConfig);
    const result = await (toolDef as any).execute(
      { mode: "help" },
      { sessionID: "ses_test" }
    );
    expect(result).toBeTruthy();
    expect(result).toContain("add");
    expect(result).toContain("search");
    expect(result).toContain("list");
    expect(result).toContain("forget");
    expect(result).toContain("help");
  });

  it("default mode (no mode provided) returns help", async () => {
    const toolDef = createMemoryTool(makeMockStore(), mockConfig);
    const result = await (toolDef as any).execute({}, { sessionID: "ses_test" });
    expect(result).toContain("add");
    expect(result).toContain("search");
    expect(result).toContain("list");
    expect(result).toContain("forget");
    expect(result).toContain("help");
  });

  it("exception from store is caught and returns friendly error string", async () => {
    const store = makeMockStore();
    (store.add as any).mockImplementation(async () => {
      throw new Error("Database connection lost");
    });
    const toolDef = createMemoryTool(store, mockConfig);
    const result = await (toolDef as any).execute(
      { mode: "add", content: "will fail" },
      { sessionID: "ses_test" }
    );
    expect(typeof result).toBe("string");
    expect(result.toLowerCase()).toContain("error");
  });

  it("unknown mode returns unknown mode message", async () => {
    const toolDef = createMemoryTool(makeMockStore(), mockConfig);
    const result = await (toolDef as any).execute(
      { mode: "bogus" as any },
      { sessionID: "ses_test" }
    );
    expect(result).toContain("Unknown mode");
    expect(result).toContain("bogus");
  });

  it("add mode passes tags and type to store.add", async () => {
    const store = makeMockStore();
    const toolDef = createMemoryTool(store, mockConfig);
    await (toolDef as any).execute(
      { mode: "add", content: "tagged memory", tags: "a,b", type: "note" },
      { sessionID: "ses_test" }
    );
    expect(store.add).toHaveBeenCalledWith("tagged memory", {
      tags: "a,b",
      type: "note",
    });
  });

  it("search mode passes limit to store.search", async () => {
    const store = makeMockStore();
    const toolDef = createMemoryTool(store, mockConfig);
    await (toolDef as any).execute(
      { mode: "search", query: "test", limit: 10 },
      { sessionID: "ses_test" }
    );
    expect(store.search).toHaveBeenCalledWith("test", 10);
  });
});
