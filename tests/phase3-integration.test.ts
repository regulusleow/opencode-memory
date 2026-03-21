import { afterAll, beforeAll, describe, expect, it, vi } from "bun:test";
import { createDatabase, closeDatabase } from "../src/services/database.js";
import { createProfileStore } from "../src/services/profile-store.js";
import { createProfileExtractor } from "../src/services/profile-extractor.js";
import { createVectorBackend } from "../src/services/vector-backend.js";
import { createMemoryStore } from "../src/services/memory-store.js";
import { createChatMessageHook, injectedSessions, needsReinjection } from "../src/services/hooks.js";
import { createWebServer } from "../src/services/web-server.js";
import { createEventHandler } from "../src/services/event-handler.js";
import type { EmbeddingService } from "../src/services/embedding.js";
import type { Logger } from "../src/services/logger.js";
import type { PluginConfig, UserProfile } from "../src/types.js";

const TEST_WEB_PORT = 19090;

function makeConfig(overrides: Partial<PluginConfig> = {}): PluginConfig {
  return {
    embeddingApiUrl: "http://test",
    embeddingApiKey: "",
    embeddingModel: "test-model",
    embeddingDimensions: 1536,
    storagePath: "/tmp/opencode-memory",
    searchLimit: 10,
    contextLimit: 5,
    embeddingBackend: "auto",
    localModel: "",
    localDtype: "",
    localCacheDir: "",
    privacyPatterns: [],
    dedupSimilarityThreshold: 0.7,
    autoCaptureEnabled: true,
    autoCaptureDelay: 1000,
    autoCaptureMinImportance: 6,
    searchLayersEnabled: true,
    profileEnabled: true,
    profileExtractionMinPrompts: 1,
    profileMaxMessagesPerExtraction: 20,
    webServerPort: TEST_WEB_PORT,
    ...overrides,
  };
}

function makeLogger(): Logger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

function makeEmbeddingService(): EmbeddingService {
  return {
    isConfigured: () => true,
    embed: vi.fn(async () => ({ embedding: new Float64Array([0.1, 0.2, 0.3, 0.4]) })),
    embedBatch: vi.fn(async (texts: string[]) =>
      texts.map(() => ({ embedding: new Float64Array([0.1, 0.2, 0.3, 0.4]) }))
    ),
  };
}

function makeTestProfile(now = Date.now()): UserProfile {
  return {
    id: "singleton",
    preferences: [
      {
        key: "language",
        value: "TypeScript",
        confidence: 0.9,
        evidence: ["用户偏好 TypeScript"],
        updatedAt: now,
      },
    ],
    patterns: [
      {
        key: "testing",
        description: "先写测试再实现",
        frequency: 2,
        lastSeen: now,
      },
    ],
    workflows: [
      {
        name: "analysis-mode",
        steps: ["收集上下文", "并行分析", "执行变更"],
        frequency: 1,
        lastSeen: now,
      },
    ],
    version: 1,
    lastAnalyzedAt: now,
    createdAt: now,
    updatedAt: now,
  };
}

describe("Phase 3 integration", () => {
  beforeAll(() => {
    injectedSessions.clear();
    needsReinjection.clear();
  });

  afterAll(() => {
    injectedSessions.clear();
    needsReinjection.clear();
  });

  it("flow 1: extracts profile and persists to profile store", async () => {
    const db = createDatabase(":memory:", 1536);
    const profileStore = createProfileStore(db);
    const logger = makeLogger();

    const client = {
      session: {
        messages: vi.fn(async () => [
          {
            info: { role: "user" },
            parts: [{ type: "text", text: "我主要使用 Objective-C 做 iOS 开发" }],
          },
        ]),
        prompt: vi.fn(async () =>
          JSON.stringify({
            preferences: [
              {
                key: "language",
                value: "Objective-C",
                confidence: 0.95,
                evidence: ["我主要使用 Objective-C"],
                updatedAt: Date.now(),
              },
            ],
            patterns: [
              {
                key: "analysis",
                description: "偏好深度分析",
                frequency: 3,
                lastSeen: Date.now(),
              },
            ],
            workflows: [
              {
                name: "analysis-mode",
                steps: ["阅读", "验证", "落地"],
                frequency: 2,
                lastSeen: Date.now(),
              },
            ],
          })
        ),
      },
    };

    const profileExtractor = createProfileExtractor({
      client,
      profileStore,
      config: makeConfig({ profileExtractionMinPrompts: 1 }),
      logger,
    });

    try {
      await profileExtractor.extract("test-session-id");

      const stored = profileStore.getProfile();
      expect(stored).not.toBeNull();
      expect(stored?.preferences[0]?.key).toBe("language");
      expect(stored?.preferences[0]?.value).toBe("Objective-C");
      expect(stored?.patterns[0]?.key).toBe("analysis");
      expect(stored?.workflows[0]?.name).toBe("analysis-mode");
    } finally {
      closeDatabase(db);
    }
  });

  it("flow 2: injects <user_profile> context into chat output", async () => {
    const db = createDatabase(":memory:", 1536);
    const profileStore = createProfileStore(db);
    const config = makeConfig({ profileEnabled: true });

    try {
      profileStore.saveProfile(makeTestProfile());

      const embeddingService = makeEmbeddingService();
      const vectorBackend = await createVectorBackend(db, config.embeddingDimensions);
      const store = createMemoryStore(db, embeddingService, config, vectorBackend);

      const chatHook = createChatMessageHook(store, config, profileStore);
      const input = { sessionID: "ses-phase3-flow2" };
      const output = {
        message: { id: "msg-phase3-flow2" },
        parts: [{ type: "text", text: "hello" }],
      };

      await chatHook(input, output);

      const profilePart = output.parts.find(
        (part) => part.type === "text" && typeof part.text === "string" && part.text.includes("<user_profile>")
      );
      expect(profilePart).toBeDefined();
    } finally {
      closeDatabase(db);
    }
  });

  it("flow 3: web API serves profile, stats, and memories", async () => {
    const db = createDatabase(":memory:", 1536);
    const profileStore = createProfileStore(db);
    const config = makeConfig({ webServerPort: TEST_WEB_PORT });
    const logger = makeLogger();

    const embeddingService = makeEmbeddingService();
    const vectorBackend = await createVectorBackend(db, config.embeddingDimensions);
    const store = createMemoryStore(db, embeddingService, config, vectorBackend);
    const webServer = createWebServer({
      store,
      profileStore,
      config,
      logger,
      getHtml: () => "<html/>",
    });

    try {
      profileStore.saveProfile(makeTestProfile());
      await store.add("phase3 memory", { tags: "phase3,integration" });

      const { url } = webServer.start();
      expect(url).toBe(`http://127.0.0.1:${TEST_WEB_PORT}`);

      const profileRes = await fetch(`${url}/api/profile`);
      expect(profileRes.status).toBe(200);
      const profile = (await profileRes.json()) as UserProfile | null;
      expect(profile).not.toBeNull();
      expect(profile?.id).toBe("singleton");

      const statsRes = await fetch(`${url}/api/stats`);
      expect(statsRes.status).toBe(200);
      const stats = (await statsRes.json()) as { total: number };
      expect(typeof stats.total).toBe("number");
      expect(stats.total).toBeGreaterThanOrEqual(1);

      const memoriesRes = await fetch(`${url}/api/memories`);
      expect(memoriesRes.status).toBe(200);
      const memories = (await memoriesRes.json()) as Array<{ id: string; content: string }>;
      expect(Array.isArray(memories)).toBe(true);
      expect(memories.length).toBeGreaterThanOrEqual(1);
    } finally {
      webServer.stop();
      closeDatabase(db);
    }
  });

  it("flow 4: idle event triggers both auto-capture and profile extraction", async () => {
    const mockOnIdle = vi.fn<(sessionID: string) => Promise<void>>(async () => {});
    const mockOnIdleProfile = vi.fn<(sessionID: string) => Promise<void>>(async () => {});

    const eventHandler = createEventHandler({
      needsReinjection: new Set<string>(),
      onIdle: mockOnIdle,
      onIdleProfile: mockOnIdleProfile,
      config: makeConfig({ autoCaptureEnabled: true, profileEnabled: true }),
      logger: makeLogger(),
    });

    await eventHandler({
      event: {
        type: "session.idle",
        properties: { sessionID: "ses-phase3-flow4" },
      },
    });

    expect(mockOnIdle).toHaveBeenCalledWith("ses-phase3-flow4");
    expect(mockOnIdleProfile).toHaveBeenCalledWith("ses-phase3-flow4");
  });
});
