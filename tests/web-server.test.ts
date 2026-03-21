import { describe, test, expect, beforeAll, afterAll, mock } from "bun:test";
import { createWebServer } from "../src/services/web-server";
import type { PluginConfig } from "../src/types";
import type { MemoryStore } from "../src/services/memory-store";
import type { ProfileStore } from "../src/services/profile-store";
import type { Logger } from "../src/services/logger";

const TEST_PORT = 19080;

function makeConfig(overrides: Partial<PluginConfig> = {}): PluginConfig {
  return {
    embeddingApiUrl: "http://test",
    embeddingApiKey: "",
    embeddingModel: "test",
    embeddingDimensions: 1536,
    storagePath: "/tmp",
    searchLimit: 20,
    contextLimit: 5,
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
    webServerPort: TEST_PORT,
    ...overrides,
  };
}

const testMemory = {
  id: "mem-1",
  content: "Test memory content",
  tags: "test",
  type: "general",
  metadata: {},
  embeddingStatus: "done" as const,
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

const testSearchResult = {
  ...testMemory,
  score: 0.9,
  distance: 0.1,
};

function makeMockStore(): MemoryStore {
  return {
    list: mock(() => Promise.resolve([testMemory])),
    search: mock(() => Promise.resolve([testSearchResult])),
    forget: mock((id: string) => Promise.resolve(id === "mem-1")),
    add: mock(() => Promise.resolve(testMemory)),
    get: mock(() => Promise.resolve(testMemory)),
    retryPendingEmbeddings: mock(() => Promise.resolve(0)),
  };
}

function makeMockProfileStore(profile: ReturnType<ProfileStore["getProfile"]> = null): ProfileStore {
  return {
    getProfile: mock(() => profile),
    saveProfile: mock(() => {}),
    mergeProfile: mock(() => {
      throw new Error("not implemented in mock");
    }),
    deletePreference: mock(() => false),
    deletePattern: mock(() => false),
    deleteWorkflow: mock(() => false),
    resetProfile: mock(() => {}),
    addChangelog: mock(() => {}),
    getChangelog: mock(() => []),
  };
}

function makeMockLogger(): Logger {
  return {
    debug: mock(() => {}),
    info: mock(() => {}),
    warn: mock(() => {}),
    error: mock(() => {}),
  };
}

describe("Web Server", () => {
  let server: ReturnType<typeof createWebServer>;
  let baseUrl: string;
  const store = makeMockStore();
  const profileStore = makeMockProfileStore({
    id: "singleton",
    preferences: [],
    patterns: [],
    workflows: [],
    version: 1,
    lastAnalyzedAt: 0,
    createdAt: 0,
    updatedAt: 0,
  });

  beforeAll(() => {
    server = createWebServer({
      store,
      profileStore,
      config: makeConfig(),
      logger: makeMockLogger(),
    });
    const result = server.start();
    baseUrl = result.url;
  });

  afterAll(() => {
    server.stop();
  });

  test("server isRunning() after start", () => {
    expect(server.isRunning()).toBe(true);
  });

  test("start() is idempotent", () => {
    const result = server.start();
    expect(result.url).toBe(baseUrl);
  });

  describe("GET /", () => {
    test("returns 200 with HTML content", async () => {
      const res = await fetch(`${baseUrl}/`);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/html");
      const text = await res.text();
      expect(text).toContain("opencode-memory");
    });
  });

  describe("GET /api/memories", () => {
    test("returns 200 with JSON array", async () => {
      const res = await fetch(`${baseUrl}/api/memories`);
      expect(res.status).toBe(200);
      const data = (await res.json()) as typeof testMemory[];
      expect(Array.isArray(data)).toBe(true);
      expect(data[0].id).toBe("mem-1");
    });

    test("returns CORS headers", async () => {
      const res = await fetch(`${baseUrl}/api/memories`);
      expect(res.headers.get("access-control-allow-origin")).toBe("*");
    });
  });

  describe("GET /api/memories?q=query", () => {
    test("calls store.search when q param present", async () => {
      const res = await fetch(`${baseUrl}/api/memories?q=test`);
      expect(res.status).toBe(200);
      const data = (await res.json()) as typeof testSearchResult[];
      expect(Array.isArray(data)).toBe(true);
      expect(store.search).toHaveBeenCalledWith("test");
    });
  });

  describe("DELETE /api/memories/:id", () => {
    test("returns 200 when memory exists", async () => {
      const res = await fetch(`${baseUrl}/api/memories/mem-1`, {
        method: "DELETE",
      });
      expect(res.status).toBe(200);
      const data = (await res.json()) as { success: boolean };
      expect(data.success).toBe(true);
    });

    test("returns 404 when memory does not exist", async () => {
      const res = await fetch(`${baseUrl}/api/memories/nonexistent`, {
        method: "DELETE",
      });
      expect(res.status).toBe(404);
    });
  });

  describe("GET /api/stats", () => {
    test("returns 200 with stats JSON", async () => {
      const res = await fetch(`${baseUrl}/api/stats`);
      expect(res.status).toBe(200);
      const data = (await res.json()) as { total: number };
      expect(typeof data.total).toBe("number");
    });
  });

  describe("GET /api/profile", () => {
    test("returns 200 with profile JSON", async () => {
      const res = await fetch(`${baseUrl}/api/profile`);
      expect(res.status).toBe(200);
      const data = (await res.json()) as { id: string };
      expect(data).not.toBeNull();
      expect(data.id).toBe("singleton");
    });
  });

  describe("GET /api/profile when no profile", () => {
    test("returns 200 with null when no profile exists", async () => {
      const emptyProfileStore = makeMockProfileStore(null);
      const server2 = createWebServer({
        store: makeMockStore(),
        profileStore: emptyProfileStore,
        config: makeConfig({ webServerPort: 19082 }),
        logger: makeMockLogger(),
      });
      server2.start();
      try {
        const res = await fetch("http://127.0.0.1:19082/api/profile");
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data).toBeNull();
      } finally {
        server2.stop();
      }
    });
  });

  describe("Unknown routes", () => {
    test("returns 404 for unknown API routes", async () => {
      const res = await fetch(`${baseUrl}/api/unknown`);
      expect(res.status).toBe(404);
    });

    test("returns 404 for unknown non-API routes", async () => {
      const res = await fetch(`${baseUrl}/nonexistent`);
      expect(res.status).toBe(404);
    });
  });

  describe("getHtml override", () => {
    test("uses custom getHtml when provided", async () => {
      const customHtml = "<html><body>Custom UI</body></html>";
      const server3 = createWebServer({
        store: makeMockStore(),
        profileStore: makeMockProfileStore(),
        config: makeConfig({ webServerPort: 19083 }),
        logger: makeMockLogger(),
        getHtml: () => customHtml,
      });
      server3.start();
      try {
        const res = await fetch("http://127.0.0.1:19083/");
        const text = await res.text();
        expect(text).toBe(customHtml);
      } finally {
        server3.stop();
      }
    });
  });
});

describe("Web Server — stop behavior", () => {
  test("isRunning() returns false after stop", () => {
    const server = createWebServer({
      store: makeMockStore(),
      profileStore: makeMockProfileStore(),
      config: makeConfig({ webServerPort: 19084 }),
      logger: makeMockLogger(),
    });
    server.start();
    expect(server.isRunning()).toBe(true);
    server.stop();
    expect(server.isRunning()).toBe(false);
  });
});

describe("Web Server — port conflict", () => {
  test("throws when port already in use", () => {
    const server1 = createWebServer({
      store: makeMockStore(),
      profileStore: makeMockProfileStore(),
      config: makeConfig({ webServerPort: 19085 }),
      logger: makeMockLogger(),
    });
    const server2 = createWebServer({
      store: makeMockStore(),
      profileStore: makeMockProfileStore(),
      config: makeConfig({ webServerPort: 19085 }),
      logger: makeMockLogger(),
    });
    server1.start();
    try {
      expect(() => server2.start()).toThrow();
    } finally {
      server1.stop();
    }
  });
});
