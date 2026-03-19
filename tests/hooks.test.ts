import { describe, it, expect, mock } from "bun:test";
import type { MemoryStore } from "../src/services/memory-store.js";
import type { MemorySearchResult, PluginConfig } from "../src/types.js";
import { createChatMessageHook } from "../src/services/hooks.js";

const defaultConfig: PluginConfig = {
  embeddingApiUrl: "http://localhost:1234/v1/embeddings",
  embeddingApiKey: "test-key",
  embeddingModel: "test-model",
  embeddingDimensions: 256,
  storagePath: "/tmp/test-memory",
  searchLimit: 10,
  contextLimit: 5,
};

function makeMockStore(searchResult: MemorySearchResult[]): MemoryStore {
  return {
    add: mock(async () => ({
      id: "mem_test",
      content: "test",
      tags: "",
      type: "general",
      metadata: {},
      embeddingStatus: "done" as const,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })),
    search: mock(async () => searchResult),
    list: mock(async () => []),
    forget: mock(async () => true),
    get: mock(async () => null),
    retryPendingEmbeddings: mock(async () => 0),
  };
}

function makeOutput(messageId = "msg_1") {
  return {
    message: { id: messageId },
    parts: [{ type: "text", text: "Hello world" }] as any[],
  };
}

function makeSearchResult(overrides?: Partial<MemorySearchResult>): MemorySearchResult {
  return {
    id: "mem_abc123",
    content: "User prefers TypeScript strict mode",
    tags: "preference",
    type: "general",
    metadata: {},
    embeddingStatus: "done",
    createdAt: 1700000000000,
    updatedAt: 1700000000000,
    score: 0.85,
    distance: 0.18,
    ...overrides,
  };
}

describe("createChatMessageHook", () => {
  it("injects memories on first message when relevant memories exist", async () => {
    const memories = [makeSearchResult()];
    const store = makeMockStore(memories);
    const hook = createChatMessageHook(store, defaultConfig);
    const input = { sessionID: "ses_1" };
    const output = makeOutput("msg_1");

    await hook(input, output);

    expect(output.parts.length).toBe(2);
    expect(output.parts[0].synthetic).toBe(true);
  });

  it("does NOT inject on second call (injected flag prevents it)", async () => {
    const memories = [makeSearchResult()];
    const store = makeMockStore(memories);
    const hook = createChatMessageHook(store, defaultConfig);
    const input = { sessionID: "ses_1" };

    const output1 = makeOutput("msg_1");
    await hook(input, output1);
    expect(output1.parts.length).toBe(2);

    const output2 = makeOutput("msg_2");
    await hook(input, output2);
    expect(output2.parts.length).toBe(1); // no injection
    expect(store.search).toHaveBeenCalledTimes(1);
  });

  it("does nothing when search returns empty array", async () => {
    const store = makeMockStore([]);
    const hook = createChatMessageHook(store, defaultConfig);
    const input = { sessionID: "ses_1" };
    const output = makeOutput("msg_1");

    await hook(input, output);

    expect(output.parts.length).toBe(1);
    expect(output.parts[0].text).toBe("Hello world");
  });

  it("does nothing when search throws (error swallowed)", async () => {
    const store = makeMockStore([]);
    store.search = mock(async () => {
      throw new Error("DB connection failed");
    });
    const hook = createChatMessageHook(store, defaultConfig);
    const input = { sessionID: "ses_1" };
    const output = makeOutput("msg_1");

    // should not throw
    await hook(input, output);

    expect(output.parts.length).toBe(1);
  });

  it("injected part has type 'text' and synthetic true", async () => {
    const memories = [makeSearchResult()];
    const store = makeMockStore(memories);
    const hook = createChatMessageHook(store, defaultConfig);
    const input = { sessionID: "ses_1" };
    const output = makeOutput("msg_1");

    await hook(input, output);

    const injected = output.parts[0];
    expect(injected.type).toBe("text");
    expect(injected.synthetic).toBe(true);
  });

  it("injected part uses 'text' field (NOT 'content') containing <relevant_memories>", async () => {
    const memories = [makeSearchResult()];
    const store = makeMockStore(memories);
    const hook = createChatMessageHook(store, defaultConfig);
    const input = { sessionID: "ses_1" };
    const output = makeOutput("msg_1");

    await hook(input, output);

    const injected = output.parts[0];
    expect(injected.text).toBeDefined();
    expect(injected.content).toBeUndefined();
    expect(injected.text).toContain("<relevant_memories>");
  });

  it("injected part includes id (prt-memory-context-), sessionID, messageID fields", async () => {
    const memories = [makeSearchResult()];
    const store = makeMockStore(memories);
    const hook = createChatMessageHook(store, defaultConfig);
    const input = { sessionID: "ses_42" };
    const output = makeOutput("msg_99");

    await hook(input, output);

    const injected = output.parts[0];
    expect(injected.id).toMatch(/^prt-memory-context-\d+$/);
    expect(injected.sessionID).toBe("ses_42");
    expect(injected.messageID).toBe("msg_99");
  });

  it("passes user message text as search query with contextLimit", async () => {
    const memories = [makeSearchResult()];
    const store = makeMockStore(memories);
    const hook = createChatMessageHook(store, defaultConfig);
    const input = { sessionID: "ses_1" };
    const output = {
      message: { id: "msg_1" },
      parts: [{ type: "text", text: "How do I configure TypeScript?" }] as any[],
    };

    await hook(input, output);

    expect(store.search).toHaveBeenCalledWith(
      "How do I configure TypeScript?",
      defaultConfig.contextLimit
    );
  });
});
