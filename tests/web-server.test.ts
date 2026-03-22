import { describe, test, expect, beforeAll, afterAll, mock } from "bun:test";
import { createWebServer } from "../src/services/web-server";
import { makeConfig, makeMockStore, makeMockProfileStore, makeMockLogger } from "./helpers.js";

const TEST_PORT = 19080;

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

describe("Web Server", () => {
  let server: ReturnType<typeof createWebServer>;
  let baseUrl: string;
  const store = makeMockStore();
  const profileData = {
    id: "singleton",
    preferences: [],
    patterns: [],
    workflows: [],
    version: 1,
    lastAnalyzedAt: 0,
    createdAt: 0,
    updatedAt: 0,
  };
  const profileStore = makeMockProfileStore({ getProfile: mock(() => profileData) });

  beforeAll(() => {
    (store.list as any).mockImplementation(() => Promise.resolve([testMemory]));
    (store.search as any).mockImplementation(() => Promise.resolve([testSearchResult]));
    (store.forget as any).mockImplementation((id: string) => Promise.resolve(id === "mem-1"));
    (store.add as any).mockImplementation(() => Promise.resolve(testMemory));
    (store.get as any).mockImplementation(() => Promise.resolve(testMemory));
    
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
      (store.getStats as any).mockImplementation(() => Promise.resolve({
        total: 1,
        byType: { general: 1 },
        byEmbeddingStatus: { done: 1 },
        oldest: Date.now(),
        newest: Date.now(),
      }));

      const res = await fetch(`${baseUrl}/api/stats`);
      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(typeof data.total).toBe("number");
      expect(typeof data.byType).toBe("object");
      expect(typeof data.byEmbeddingStatus).toBe("object");
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
      const emptyProfileStore = makeMockProfileStore();
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

  describe("GET /api/export", () => {
    test("returns 200 with export data containing schemaVersion", async () => {
      (store.exportAll as any).mockImplementation(async () => ({
        schemaVersion: 1,
        embeddingModel: "test-model",
        exportedAt: new Date().toISOString(),
        totalCount: 1,
        memories: [{
          id: "mem-1",
          content: "Test content",
          tags: "test",
          type: "general",
          metadata: {},
          createdAt: Date.now(),
          updatedAt: Date.now(),
          searchHitCount: 0,
          lastAccessedAt: null,
        }],
      }));

      const res = await fetch(`${baseUrl}/api/export`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.schemaVersion).toBe(1);
      expect(body.embeddingModel).toBe("test-model");
      expect(Array.isArray(body.memories)).toBe(true);
      expect(body.totalCount).toBe(1);
    });

    test("returns CORS headers", async () => {
      const res = await fetch(`${baseUrl}/api/export`);
      expect(res.status).toBe(200);
      expect(res.headers.get("access-control-allow-origin")).toBe("*");
    });
  });

  describe("POST /api/import", () => {
    test("returns 200 with imported and skipped counts on valid data", async () => {
      (store.importMemories as any).mockImplementation(async (data: any) => ({
        imported: data.memories.length,
        skipped: 0,
      }));

      const importData = {
        schemaVersion: 1,
        embeddingModel: "test",
        exportedAt: new Date().toISOString(),
        totalCount: 1,
        memories: [{
          id: "mem-1",
          content: "Test",
          tags: "test",
          type: "general" as const,
          metadata: {},
          createdAt: Date.now(),
          updatedAt: Date.now(),
          searchHitCount: 0,
          lastAccessedAt: null,
        }],
      };

      const res = await fetch(`${baseUrl}/api/import`, {
        method: "POST",
        body: JSON.stringify(importData),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.imported).toBe(1);
      expect(body.skipped).toBe(0);
    });

    test("returns 400 on invalid JSON", async () => {
      const res = await fetch(`${baseUrl}/api/import`, {
        method: "POST",
        body: "invalid json {",
      });
      expect(res.status).toBe(400);
      const body = (await res.json()) as any;
      expect(body.error).toContain("invalid JSON");
    });

    test("returns 400 when schemaVersion is missing", async () => {
      const res = await fetch(`${baseUrl}/api/import`, {
        method: "POST",
        body: JSON.stringify({
          embeddingModel: "test",
          memories: [],
        }),
      });
      expect(res.status).toBe(400);
      const body = (await res.json()) as any;
      expect(body.error).toContain("schemaVersion");
    });

    test("returns CORS headers", async () => {
      (store.importMemories as any).mockImplementation(async () => ({
        imported: 0,
        skipped: 0,
      }));

      const res = await fetch(`${baseUrl}/api/import`, {
        method: "POST",
        body: JSON.stringify({
          schemaVersion: 1,
          embeddingModel: "test",
          exportedAt: new Date().toISOString(),
          totalCount: 0,
          memories: [],
        }),
      });
      expect(res.status).toBe(200);
      expect(res.headers.get("access-control-allow-origin")).toBe("*");
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
