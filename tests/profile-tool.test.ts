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
  embeddingBackend: "auto",
  localModel: "",
  localDtype: "",
  localCacheDir: "",
  privacyPatterns: [],
  dedupSimilarityThreshold: 0.9,
  autoCaptureEnabled: false,
  autoCaptureDelay: 1000,
  autoCaptureMinImportance: 6,
  searchLayersEnabled: true,
  profileEnabled: true,
  profileExtractionMinPrompts: 5,
  profileMaxMessagesPerExtraction: 20,
  webServerPort: 18080,
};

function makeMockProfileStore(profile: ReturnType<typeof makeTestProfile> | null = null) {
  return {
    getProfile: mock(() => profile),
    saveProfile: mock(() => {}),
    mergeProfile: mock(() => profile ?? makeTestProfile()),
    deletePreference: mock(() => true),
    deletePattern: mock(() => true),
    deleteWorkflow: mock(() => true),
    resetProfile: mock(() => {}),
    addChangelog: mock(() => {}),
    getChangelog: mock(() => []),
  };
}

function makeTestProfile() {
  return {
    id: "singleton",
    preferences: [
      { key: "lang", value: "TypeScript", confidence: 0.9, evidence: ["uses .ts files"], updatedAt: Date.now() },
    ],
    patterns: [
      { key: "tdd", description: "Uses TDD workflow", frequency: 5, lastSeen: Date.now() },
    ],
    workflows: [
      { name: "deploy", steps: ["build", "test", "push"], frequency: 3, lastSeen: Date.now() },
    ],
    version: 1,
    lastAnalyzedAt: Date.now(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

function makeMockExtractor() {
  return {
    extract: mock(async (_sessionID: string) => {}),
  };
}

describe("createMemoryTool — profile mode", () => {
  it("profile show returns 'no profile' message when empty", async () => {
    const tool = createMemoryTool(makeMockStore(), mockConfig, {
      profileStore: makeMockProfileStore(null),
    });
    const result = await (tool as any).execute(
      { mode: "profile", action: "show" },
      { sessionID: "ses_test" }
    );
    expect(result.toLowerCase()).toContain("no profile");
  });

  it("profile show returns formatted profile when data exists", async () => {
    const profile = makeTestProfile();
    const tool = createMemoryTool(makeMockStore(), mockConfig, {
      profileStore: makeMockProfileStore(profile),
    });
    const result = await (tool as any).execute(
      { mode: "profile", action: "show" },
      { sessionID: "ses_test" }
    );
    expect(result).toContain("lang");
    expect(result).toContain("TypeScript");
  });

  it("profile show is default action when action is omitted", async () => {
    const profile = makeTestProfile();
    const tool = createMemoryTool(makeMockStore(), mockConfig, {
      profileStore: makeMockProfileStore(profile),
    });
    const result = await (tool as any).execute(
      { mode: "profile" },
      { sessionID: "ses_test" }
    );
    expect(result).toContain("lang");
  });

  it("profile analyze calls extractor.extract() with sessionID from toolCtx", async () => {
    const extractor = makeMockExtractor();
    const tool = createMemoryTool(makeMockStore(), mockConfig, {
      profileStore: makeMockProfileStore(null),
      profileExtractor: extractor,
    });
    await (tool as any).execute(
      { mode: "profile", action: "analyze" },
      { sessionID: "sess-1" }
    );
    expect(extractor.extract).toHaveBeenCalledWith("sess-1");
  });

  it("profile delete with preference:key calls deletePreference", async () => {
    const profileStore = makeMockProfileStore(null);
    const tool = createMemoryTool(makeMockStore(), mockConfig, { profileStore });
    await (tool as any).execute(
      { mode: "profile", action: "delete", content: "preference:lang" },
      { sessionID: "ses_test" }
    );
    expect(profileStore.deletePreference).toHaveBeenCalledWith("lang");
  });

  it("profile delete with pattern:key calls deletePattern", async () => {
    const profileStore = makeMockProfileStore(null);
    const tool = createMemoryTool(makeMockStore(), mockConfig, { profileStore });
    await (tool as any).execute(
      { mode: "profile", action: "delete", content: "pattern:tdd" },
      { sessionID: "ses_test" }
    );
    expect(profileStore.deletePattern).toHaveBeenCalledWith("tdd");
  });

  it("profile delete with workflow:name calls deleteWorkflow", async () => {
    const profileStore = makeMockProfileStore(null);
    const tool = createMemoryTool(makeMockStore(), mockConfig, { profileStore });
    await (tool as any).execute(
      { mode: "profile", action: "delete", content: "workflow:deploy" },
      { sessionID: "ses_test" }
    );
    expect(profileStore.deleteWorkflow).toHaveBeenCalledWith("deploy");
  });

  it("profile reset calls profileStore.resetProfile()", async () => {
    const profileStore = makeMockProfileStore(null);
    const tool = createMemoryTool(makeMockStore(), mockConfig, { profileStore });
    await (tool as any).execute(
      { mode: "profile", action: "reset" },
      { sessionID: "ses_test" }
    );
    expect(profileStore.resetProfile).toHaveBeenCalled();
  });

  it("profile mode returns disabled message when profileEnabled=false", async () => {
    const tool = createMemoryTool(
      makeMockStore(),
      { ...mockConfig, profileEnabled: false },
      { profileStore: makeMockProfileStore(null) }
    );
    const result = await (tool as any).execute(
      { mode: "profile", action: "show" },
      { sessionID: "ses_test" }
    );
    expect(result.toLowerCase()).toContain("disabled");
  });
});

describe("createMemoryTool — web mode", () => {
  it("web mode calls onWebStart and returns URL", async () => {
    const onWebStart = mock(() => Promise.resolve("http://127.0.0.1:18080"));
    const tool = createMemoryTool(makeMockStore(), mockConfig, { onWebStart });
    const result = await (tool as any).execute(
      { mode: "web" },
      { sessionID: "ses_test" }
    );
    expect(onWebStart).toHaveBeenCalled();
    expect(result).toContain("127.0.0.1");
  });

  it("web mode returns unavailable message when onWebStart is not provided", async () => {
    const tool = createMemoryTool(makeMockStore(), mockConfig);
    const result = await (tool as any).execute(
      { mode: "web" },
      { sessionID: "ses_test" }
    );
    expect(result.toLowerCase()).toContain("not available");
  });
});

describe("createMemoryTool — existing modes unaffected by profile/web additions", () => {
  it("add mode still works", async () => {
    const store = makeMockStore();
    const tool = createMemoryTool(store, mockConfig);
    await (tool as any).execute(
      { mode: "add", content: "test memory" },
      { sessionID: "ses_test" }
    );
    expect(store.add).toHaveBeenCalled();
  });

  it("search mode still works", async () => {
    const store = makeMockStore();
    const tool = createMemoryTool(store, mockConfig);
    await (tool as any).execute(
      { mode: "search", query: "query" },
      { sessionID: "ses_test" }
    );
    expect(store.search).toHaveBeenCalled();
  });
});
