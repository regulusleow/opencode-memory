import { describe, it, expect, mock, beforeEach } from "bun:test";
import type { MemorySearchResult } from "../src/types.js";
import { makeConfig, makeMockStore } from "./helpers.js";
import {
  createChatMessageHook,
  injectedSessions,
  needsReinjection,
} from "../src/services/hooks.js";
import { createDatabase } from "../src/services/database.js";
import { createProfileStore } from "../src/services/profile-store.js";

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
  beforeEach(() => {
    injectedSessions.clear();
    needsReinjection.clear();
  });

  it("injects memories on first message when relevant memories exist", async () => {
    const memories = [makeSearchResult()];
    const store = makeMockStore({ search: mock(async () => memories) });
    const hook = createChatMessageHook(store, makeConfig({ embeddingDimensions: 256, searchLimit: 10, contextLimit: 5 }));
    const input = { sessionID: "ses_1" };
    const output = makeOutput("msg_1");

    await hook(input, output);

    expect(output.parts.length).toBe(2);
    expect(output.parts[0].synthetic).toBe(true);
  });

  it("does NOT inject on second call (injected flag prevents it)", async () => {
    const memories = [makeSearchResult()];
    const store = makeMockStore({ search: mock(async () => memories) });
    const hook = createChatMessageHook(store, makeConfig({ embeddingDimensions: 256, searchLimit: 10, contextLimit: 5 }));
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
    const store = makeMockStore({ search: mock(async () => []) });
    const hook = createChatMessageHook(store, makeConfig({ embeddingDimensions: 256, searchLimit: 10, contextLimit: 5 }));
    const input = { sessionID: "ses_1" };
    const output = makeOutput("msg_1");

    await hook(input, output);

    expect(output.parts.length).toBe(1);
    expect(output.parts[0].text).toBe("Hello world");
  });

  it("does nothing when search throws (error swallowed)", async () => {
    const store = makeMockStore({ search: mock(async () => []) });
    store.search = mock(async () => {
      throw new Error("DB connection failed");
    });
    const hook = createChatMessageHook(store, makeConfig({ embeddingDimensions: 256, searchLimit: 10, contextLimit: 5 }));
    const input = { sessionID: "ses_1" };
    const output = makeOutput("msg_1");

    // should not throw
    await hook(input, output);

    expect(output.parts.length).toBe(1);
  });

  it("injected part has type 'text' and synthetic true", async () => {
    const memories = [makeSearchResult()];
    const store = makeMockStore({ search: mock(async () => memories) });
    const hook = createChatMessageHook(store, makeConfig({ embeddingDimensions: 256, searchLimit: 10, contextLimit: 5 }));
    const input = { sessionID: "ses_1" };
    const output = makeOutput("msg_1");

    await hook(input, output);

    const injected = output.parts[0];
    expect(injected.type).toBe("text");
    expect(injected.synthetic).toBe(true);
  });

  it("injected part uses 'text' field (NOT 'content') containing <relevant_memories>", async () => {
    const memories = [makeSearchResult()];
    const store = makeMockStore({ search: mock(async () => memories) });
    const hook = createChatMessageHook(store, makeConfig({ embeddingDimensions: 256, searchLimit: 10, contextLimit: 5 }));
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
    const store = makeMockStore({ search: mock(async () => memories) });
    const hook = createChatMessageHook(store, makeConfig({ embeddingDimensions: 256, searchLimit: 10, contextLimit: 5 }));
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
    const store = makeMockStore({ search: mock(async () => memories) });
    const hook = createChatMessageHook(store, makeConfig({ embeddingDimensions: 256, searchLimit: 10, contextLimit: 5 }));
    const input = { sessionID: "ses_1" };
    const output = {
      message: { id: "msg_1" },
      parts: [{ type: "text", text: "How do I configure TypeScript?" }] as any[],
    };

    await hook(input, output);

    expect(store.search).toHaveBeenCalledWith(
      "How do I configure TypeScript?",
      makeConfig({ embeddingDimensions: 256, searchLimit: 10, contextLimit: 5 }).contextLimit
    );
  });

  it("different sessions both get injection", async () => {
    const memories = [makeSearchResult()];
    const store = makeMockStore({ search: mock(async () => memories) });
    const hook = createChatMessageHook(store, makeConfig({ embeddingDimensions: 256, searchLimit: 10, contextLimit: 5 }));

    const inputA = { sessionID: "ses_A" };
    const outputA = makeOutput("msg_1");
    await hook(inputA, outputA);
    expect(outputA.parts.length).toBe(2);
    expect(outputA.parts[0].synthetic).toBe(true);

    const inputB = { sessionID: "ses_B" };
    const outputB = makeOutput("msg_2");
    await hook(inputB, outputB);
    expect(outputB.parts.length).toBe(2);
    expect(outputB.parts[0].synthetic).toBe(true);
    expect(store.search).toHaveBeenCalledTimes(2);
  });

  it("same session does NOT inject twice", async () => {
    const memories = [makeSearchResult()];
    const store = makeMockStore({ search: mock(async () => memories) });
    const hook = createChatMessageHook(store, makeConfig({ embeddingDimensions: 256, searchLimit: 10, contextLimit: 5 }));
    const input = { sessionID: "ses_A" };

    const output1 = makeOutput("msg_1");
    await hook(input, output1);
    expect(output1.parts.length).toBe(2);

    const output2 = makeOutput("msg_2");
    await hook(input, output2);
    expect(output2.parts.length).toBe(1); // no injection
    expect(store.search).toHaveBeenCalledTimes(1);
  });

  it("needsReinjection flag triggers re-injection", async () => {
    const memories = [makeSearchResult()];
    const store = makeMockStore({ search: mock(async () => memories) });
    const hook = createChatMessageHook(store, makeConfig({ embeddingDimensions: 256, searchLimit: 10, contextLimit: 5 }));
    const input = { sessionID: "ses_A" };

    const output1 = makeOutput("msg_1");
    await hook(input, output1);
    expect(output1.parts.length).toBe(2);
    expect(needsReinjection.has("ses_A")).toBe(false);

    needsReinjection.add("ses_A");
    expect(needsReinjection.has("ses_A")).toBe(true);

    const output2 = makeOutput("msg_2");
    await hook(input, output2);
    expect(output2.parts.length).toBe(2); // injection happened
    expect(needsReinjection.has("ses_A")).toBe(false); // flag was consumed
    expect(store.search).toHaveBeenCalledTimes(2);
  });

  it("flag is consumed after re-injection - third call does NOT inject", async () => {
    const memories = [makeSearchResult()];
    const store = makeMockStore({ search: mock(async () => memories) });
    const hook = createChatMessageHook(store, makeConfig({ embeddingDimensions: 256, searchLimit: 10, contextLimit: 5 }));
    const input = { sessionID: "ses_A" };

    const output1 = makeOutput("msg_1");
    await hook(input, output1);
    expect(output1.parts.length).toBe(2);

    needsReinjection.add("ses_A");

    const output2 = makeOutput("msg_2");
    await hook(input, output2);
    expect(output2.parts.length).toBe(2);

    const output3 = makeOutput("msg_3");
    await hook(input, output3);
    expect(output3.parts.length).toBe(1); // no injection
    expect(store.search).toHaveBeenCalledTimes(2);
  });

  it("search fails during re-injection but flag is cleared (no infinite retry)", async () => {
    injectedSessions.add("ses_A");
    const store = makeMockStore({ search: mock(async () => [makeSearchResult()]) });
    store.search = mock(async () => {
      throw new Error("DB error");
    });
    const hook = createChatMessageHook(store, makeConfig({ embeddingDimensions: 256, searchLimit: 10, contextLimit: 5 }));
    const input = { sessionID: "ses_A" };

    needsReinjection.add("ses_A");
    expect(needsReinjection.has("ses_A")).toBe(true);

    const output = makeOutput("msg_1");
    await hook(input, output);

    // Flag is cleared even though search failed (prevents infinite retry)
    expect(needsReinjection.has("ses_A")).toBe(false);
    // output.parts unchanged (no injection happened due to error)
    expect(output.parts.length).toBe(1);
  });

  it("re-injection uses same query extraction as initial injection", async () => {
    const store = makeMockStore({ search: mock(async () => [makeSearchResult()]) });
    const hook = createChatMessageHook(store, makeConfig({ embeddingDimensions: 256, searchLimit: 10, contextLimit: 5 }));
    const input = { sessionID: "ses_A" };

    // First injection with TypeScript config message
    const output1 = makeOutput("msg_1");
    output1.parts = [{ type: "text", text: "TypeScript config" }] as any[];
    await hook(input, output1);
    expect(store.search).toHaveBeenCalledWith("TypeScript config", makeConfig({ embeddingDimensions: 256, searchLimit: 10, contextLimit: 5 }).contextLimit);

    // Mark for re-injection with different message
    needsReinjection.add("ses_A");

    const output2 = makeOutput("msg_2");
    output2.parts = [{ type: "text", text: "Second message" }] as any[];
    await hook(input, output2);

    // Should search with new message text, not the old one
    expect(store.search).toHaveBeenLastCalledWith(
      "Second message",
      makeConfig({ embeddingDimensions: 256, searchLimit: 10, contextLimit: 5 }).contextLimit
    );
  });

  it("re-injection result is prepended to output.parts", async () => {
    injectedSessions.add("ses_A");
    needsReinjection.add("ses_A");

    const memories = [makeSearchResult()];
    const store = makeMockStore({ search: mock(async () => memories) });
    const hook = createChatMessageHook(store, makeConfig({ embeddingDimensions: 256, searchLimit: 10, contextLimit: 5 }));
    const input = { sessionID: "ses_A" };

    const output = makeOutput("msg_1");
    output.parts = [{ type: "text", text: "some user message" }] as any[];

    await hook(input, output);

    expect(output.parts.length).toBe(2);
    expect(output.parts[0].synthetic).toBe(true);
    expect(output.parts[1].text).toBe("some user message"); // original message is now at index 1
  });
});

describe("token budget enforcement", () => {
  beforeEach(() => {
    injectedSessions.clear();
    needsReinjection.clear();
  });

  function countInjectedMemories(output: ReturnType<typeof makeOutput>): number {
    const memoryPart = output.parts.find((p: any) => p.text?.startsWith("<relevant_memories>"));
    if (!memoryPart?.text) return 0;
    return (memoryPart.text.match(/^\d+\.\s/gm) ?? []).length;
  }

  it("uses all memories when tokenBudget is undefined", async () => {
    const memories = [
      makeSearchResult({ id: "mem_1", content: "memory one" }),
      makeSearchResult({ id: "mem_2", content: "memory two" }),
      makeSearchResult({ id: "mem_3", content: "memory three" }),
    ];
    const store = makeMockStore({ search: mock(async () => memories) });
    const hook = createChatMessageHook(store, makeConfig({ contextLimit: 5 }));
    const output = makeOutput("msg_tb_1");

    await hook({ sessionID: "ses_tb_1" }, output);

    expect(countInjectedMemories(output)).toBe(3);
  });

  it("enforces at-least-1 memory when tokenBudget is too small", async () => {
    const longContent = "A".repeat(300);
    const memories = [
      makeSearchResult({ id: "mem_1", content: longContent }),
      makeSearchResult({ id: "mem_2", content: longContent }),
      makeSearchResult({ id: "mem_3", content: longContent }),
    ];
    const store = makeMockStore({ search: mock(async () => memories) });
    const hook = createChatMessageHook(store, makeConfig({ contextLimit: 5, tokenBudget: 50 }));
    const output = makeOutput("msg_tb_2");

    await hook({ sessionID: "ses_tb_2" }, output);

    expect(countInjectedMemories(output)).toBe(1);
  });

  it("uses all memories when tokenBudget is large enough", async () => {
    const memories = [
      makeSearchResult({ id: "mem_1", content: "memory one" }),
      makeSearchResult({ id: "mem_2", content: "memory two" }),
      makeSearchResult({ id: "mem_3", content: "memory three" }),
    ];
    const store = makeMockStore({ search: mock(async () => memories) });
    const hook = createChatMessageHook(store, makeConfig({ contextLimit: 5, tokenBudget: 10000 }));
    const output = makeOutput("msg_tb_3");

    await hook({ sessionID: "ses_tb_3" }, output);

    expect(countInjectedMemories(output)).toBe(3);
  });

  it("treats tokenBudget=0 as disabled", async () => {
    const memories = [
      makeSearchResult({ id: "mem_1", content: "memory one" }),
      makeSearchResult({ id: "mem_2", content: "memory two" }),
      makeSearchResult({ id: "mem_3", content: "memory three" }),
    ];
    const store = makeMockStore({ search: mock(async () => memories) });
    const hook = createChatMessageHook(store, makeConfig({ contextLimit: 5, tokenBudget: 0 }));
    const output = makeOutput("msg_tb_4");

    await hook({ sessionID: "ses_tb_4" }, output);

    expect(countInjectedMemories(output)).toBe(3);
  });

  it("still applies contextLimit before token budget filtering", async () => {
    const memories = [
      makeSearchResult({ id: "mem_1" }),
      makeSearchResult({ id: "mem_2" }),
      makeSearchResult({ id: "mem_3" }),
    ];
    const store = makeMockStore({
      search: mock(async (_query: string, limit = 5) => memories.slice(0, limit)),
    });
    const config = makeConfig({ contextLimit: 2, tokenBudget: 10000 });
    const hook = createChatMessageHook(store, config);
    const output = makeOutput("msg_tb_5");

    await hook({ sessionID: "ses_tb_5" }, output);

    expect(store.search).toHaveBeenCalledWith("Hello world", 2);
    expect(countInjectedMemories(output)).toBe(2);
  });
});

function makeProfileDb() {
  const db = createDatabase(":memory:", 0);
  return { db, profileStore: createProfileStore(db) };
}

function makeTestProfile(overrides?: Partial<{
  preferences: { key: string; value: string; confidence: number; evidence: string[]; updatedAt: number }[];
  patterns: { key: string; description: string; frequency: number; lastSeen: number }[];
  workflows: { name: string; steps: string[]; frequency: number; lastSeen: number }[];
}>) {
  const now = Date.now();
  return {
    id: "singleton",
    preferences: overrides?.preferences ?? [
      { key: "lang", value: "TypeScript", confidence: 0.9, evidence: [], updatedAt: now },
    ],
    patterns: overrides?.patterns ?? [],
    workflows: overrides?.workflows ?? [],
    version: 1,
    lastAnalyzedAt: now,
    createdAt: now,
    updatedAt: now,
  };
}

describe("createChatMessageHook — profile injection", () => {
  beforeEach(() => {
    injectedSessions.clear();
    needsReinjection.clear();
  });

  it("injects profile part when profile exists", async () => {
    const { profileStore } = makeProfileDb();
    profileStore.saveProfile(makeTestProfile());

    const store = makeMockStore({ search: mock(async () => []) });
    const hook = createChatMessageHook(store, makeConfig({ embeddingDimensions: 256, searchLimit: 10, contextLimit: 5 }), profileStore);
    const input = { sessionID: "ses_p1" };
    const output = makeOutput("msg_p1");

    await hook(input, output);

    const profilePart = output.parts.find((p: any) => p.text?.includes("<user_profile>"));
    expect(profilePart).toBeDefined();
    expect(profilePart.synthetic).toBe(true);
  });

  it("profile part uses <user_profile> XML tag", async () => {
    const { profileStore } = makeProfileDb();
    profileStore.saveProfile(makeTestProfile({
      preferences: [{ key: "style", value: "functional", confidence: 0.8, evidence: [], updatedAt: Date.now() }],
    }));

    const store = makeMockStore({ search: mock(async () => []) });
    const hook = createChatMessageHook(store, makeConfig({ embeddingDimensions: 256, searchLimit: 10, contextLimit: 5 }), profileStore);
    const input = { sessionID: "ses_p2" };
    const output = makeOutput("msg_p2");

    await hook(input, output);

    const profilePart = output.parts.find((p: any) => p.text?.includes("<user_profile>"));
    expect(profilePart).toBeDefined();
    expect(profilePart.text).toContain("</user_profile>");
    expect(profilePart.text).toContain("style");
    expect(profilePart.text).toContain("functional");
  });

  it("profile part comes before memory part (correct order)", async () => {
    const { profileStore } = makeProfileDb();
    profileStore.saveProfile(makeTestProfile());

    const storeWithMemory = makeMockStore({ search: mock(async () => [makeSearchResult()]) });
    const hook = createChatMessageHook(storeWithMemory, makeConfig({ embeddingDimensions: 256, searchLimit: 10, contextLimit: 5 }), profileStore);
    const input = { sessionID: "ses_p3" };
    const output = makeOutput("msg_p3");

    await hook(input, output);

    const profileIdx = output.parts.findIndex((p: any) => p.text?.includes("<user_profile>"));
    const memoryIdx = output.parts.findIndex((p: any) => p.text?.includes("<relevant_memories>"));
    expect(profileIdx).toBeGreaterThanOrEqual(0);
    expect(memoryIdx).toBeGreaterThanOrEqual(0);
    expect(profileIdx).toBeLessThan(memoryIdx);
  });

  it("does NOT inject profile part when profile is null", async () => {
    const { profileStore } = makeProfileDb();

    const store = makeMockStore({ search: mock(async () => []) });
    const hook = createChatMessageHook(store, makeConfig({ embeddingDimensions: 256, searchLimit: 10, contextLimit: 5 }), profileStore);
    const input = { sessionID: "ses_p4" };
    const output = makeOutput("msg_p4");

    await hook(input, output);

    const profilePart = output.parts.find((p: any) => p.text?.includes("<user_profile>"));
    expect(profilePart).toBeUndefined();
  });

  it("does NOT inject profile when profileEnabled=false in config", async () => {
    const { profileStore } = makeProfileDb();
    profileStore.saveProfile(makeTestProfile());

    const disabledConfig = { ...makeConfig({ embeddingDimensions: 256, searchLimit: 10, contextLimit: 5 }), profileEnabled: false };
    const store = makeMockStore({ search: mock(async () => []) });
    const hook = createChatMessageHook(store, disabledConfig, profileStore);
    const input = { sessionID: "ses_p5" };
    const output = makeOutput("msg_p5");

    await hook(input, output);

    const profilePart = output.parts.find((p: any) => p.text?.includes("<user_profile>"));
    expect(profilePart).toBeUndefined();
  });

  it("works without profileStore (backward compatibility)", async () => {
    const store = makeMockStore({ search: mock(async () => []) });
    const hook = createChatMessageHook(store, makeConfig({ embeddingDimensions: 256, searchLimit: 10, contextLimit: 5 }));
    const input = { sessionID: "ses_p6" };
    const output = makeOutput("msg_p6");

    await hook(input, output);
    expect(output.parts.length).toBe(1);
  });
});
