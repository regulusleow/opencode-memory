import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createAutoCapture } from "../src/services/auto-capture.js";
import { createAiService } from "../src/services/ai-service.js";
import { createProfileExtractor } from "../src/services/profile-extractor.js";
import { createDatabase, closeDatabase } from "../src/services/database.js";
import { createProfileStore } from "../src/services/profile-store.js";
import { getConfig } from "../src/config.js";
import type { AiService, Memory, PluginConfig } from "../src/types.js";
import type { Logger } from "../src/services/logger.js";
import type { MemoryStore } from "../src/services/memory-store.js";

function makeConfig(overrides: Partial<PluginConfig> = {}): PluginConfig {
  return {
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
    dedupSimilarityThreshold: 0.7,
    autoCaptureEnabled: true,
    autoCaptureDelay: 0,
    autoCaptureMinImportance: 6,
    aiApiUrl: "",
    aiApiKey: "",
    aiModel: "",
    autoCaptureMode: "heuristic",
    searchLayersEnabled: true,
    profileEnabled: true,
    profileExtractionMinPrompts: 5,
    profileMaxMessagesPerExtraction: 20,
    webServerPort: 18080,
    logLevel: "silent",
    ...overrides,
  };
}

function makeMemory(content: string): Memory {
  const now = Date.now();
  return {
    id: `mem_${Math.random().toString(36).slice(2)}`,
    content,
    tags: "auto-captured",
    type: "auto",
    metadata: {},
    embeddingStatus: "done",
    createdAt: now,
    updatedAt: now,
  };
}

function makeStore() {
  const add = mock(async (content: string) => makeMemory(content));
  const store: MemoryStore = {
    add,
    search: mock(async () => []),
    list: mock(async () => []),
    forget: mock(async () => true),
    get: mock(async () => null),
    retryPendingEmbeddings: mock(async () => 0),
  };
  return { store, add };
}

function makeLogger(): Logger {
  return {
    debug: mock(() => {}),
    info: mock(() => {}),
    warn: mock(() => {}),
    error: mock(() => {}),
  };
}

function makeClient(messages: Array<{ info: Record<string, unknown>; parts: Array<{ type: string; text?: string }> }>) {
  return {
    session: {
      messages: mock(async () => messages),
    },
  };
}

function makeMockAiService(completeFn?: (...args: unknown[]) => Promise<string>): AiService {
  return {
    complete: mock(completeFn ?? (async () => JSON.stringify({ memories: [] }))),
    isConfigured: mock(() => true),
  };
}

describe("Phase 5 AI integration", () => {
  describe("Test 1 — Heuristic mode backward compatibility", () => {
    it("stores high-importance messages via heuristic without aiService", async () => {
      const { store, add } = makeStore();
      const logger = makeLogger();
      // "decision architecture" scores 5 + 2 + 2 = 9 (>= 6 threshold)
      const client = makeClient([
        { info: { role: "user" }, parts: [{ type: "text", text: "decision architecture for the project" }] },
      ]);

      const capture = createAutoCapture({
        client,
        store,
        config: makeConfig({ autoCaptureMode: "heuristic" }),
        logger,

      });

      await capture("ses_integ_1");

      expect(add).toHaveBeenCalledTimes(1);
      expect(add).toHaveBeenCalledWith("decision architecture for the project", {
        tags: "auto-captured",
        type: "auto",
      });
    });

    it("does not invoke AI when in heuristic mode even if aiService is provided", async () => {
      const { store } = makeStore();
      const logger = makeLogger();
      const mockAiService = makeMockAiService();
      const client = makeClient([
        { info: { role: "user" }, parts: [{ type: "text", text: "decision" }] },
      ]);

      const capture = createAutoCapture({
        client,
        store,
        config: makeConfig({ autoCaptureMode: "heuristic" }),
        logger,
        aiService: mockAiService,
      });

      await capture("ses_integ_1b");

      expect(mockAiService.complete as ReturnType<typeof mock>).not.toHaveBeenCalled();
    });
  });

  describe("Test 2 — AI mode with mock AiService", () => {
    it("calls aiService.complete and stores AI-extracted memories", async () => {
      const { store, add } = makeStore();
      const logger = makeLogger();
      const mockAiService = makeMockAiService(async () =>
        JSON.stringify({
          memories: [{ content: "learned X about architecture", tags: "architecture,decision" }],
        })
      );

      const client = makeClient([
        { info: { role: "user" }, parts: [{ type: "text", text: "We decided on microservices architecture" }] },
        { info: { role: "assistant" }, parts: [{ type: "text", text: "Good choice for scalability" }] },
      ]);

      const capture = createAutoCapture({
        client,
        store,
        config: makeConfig({ autoCaptureMode: "ai" }),
        logger,
        aiService: mockAiService,
      });

      await capture("ses_integ_2");

      expect(mockAiService.complete as ReturnType<typeof mock>).toHaveBeenCalledTimes(1);
      expect(add).toHaveBeenCalledTimes(1);
      expect(add).toHaveBeenCalledWith("learned X about architecture", {
        tags: "architecture,decision",
        type: "auto",
      });
    });
  });

  describe("Test 3 — Hybrid mode pre-filtering", () => {
    it("calls aiService only with messages that pass importance threshold", async () => {
      const { store } = makeStore();
      const logger = makeLogger();
      const mockAiService = makeMockAiService(async () =>
        JSON.stringify({ memories: [] })
      );

      const client = makeClient([
        { info: { role: "user" }, parts: [{ type: "text", text: "ok" }] }, // score 5 < 6
        { info: { role: "user" }, parts: [{ type: "text", text: "decision architecture bug" }] }, // score 11 >= 6
      ]);

      const capture = createAutoCapture({
        client,
        store,
        config: makeConfig({ autoCaptureMode: "hybrid" }),
        logger,
        aiService: mockAiService,
      });

      await capture("ses_integ_3a");

      expect(mockAiService.complete as ReturnType<typeof mock>).toHaveBeenCalledTimes(1);
      const [promptArg] = (mockAiService.complete as ReturnType<typeof mock>).mock.calls[0] as [string];
      expect(promptArg).toContain("decision architecture bug");
      expect(promptArg).not.toContain("ok");
    });

    it("does not call aiService when all messages are below threshold", async () => {
      const { store } = makeStore();
      const logger = makeLogger();
      const mockAiService = makeMockAiService();

      const client = makeClient([
        { info: { role: "user" }, parts: [{ type: "text", text: "ok" }] },
        { info: { role: "user" }, parts: [{ type: "text", text: "sure" }] },
      ]);

      const capture = createAutoCapture({
        client,
        store,
        config: makeConfig({ autoCaptureMode: "hybrid" }),
        logger,
        aiService: mockAiService,
      });

      await capture("ses_integ_3b");

      expect(mockAiService.complete as ReturnType<typeof mock>).not.toHaveBeenCalled();
    });
  });

  describe("Test 4 — AI failure graceful degradation", () => {
    it("logs error and does not crash or store when AI fails", async () => {
      const { store, add } = makeStore();
      const logger = makeLogger();
      const failingAiService = makeMockAiService(async () => {
        throw new Error("API unavailable");
      });

      const client = makeClient([
        { info: { role: "user" }, parts: [{ type: "text", text: "important decision about architecture" }] },
      ]);

      const capture = createAutoCapture({
        client,
        store,
        config: makeConfig({ autoCaptureMode: "ai" }),
        logger,
        aiService: failingAiService,
      });

      await capture("ses_integ_4");

      expect(add).not.toHaveBeenCalled();
      expect(logger.error as ReturnType<typeof mock>).toHaveBeenCalled();
    });
  });

  describe("Test 5 — Profile extractor uses AiService", () => {
    it("calls aiService.complete for profile extraction (not client.session.prompt)", async () => {
      const db = createDatabase(":memory:", 0);
      const profileStore = createProfileStore(db);
      const logger = makeLogger();

      let capturedPrompt = "";
      const mockAiService = makeMockAiService(async (promptText: unknown) => {
        capturedPrompt = promptText as string;
        return JSON.stringify({
          preferences: [
            {
              key: "language",
              value: "TypeScript",
              confidence: 0.9,
              evidence: ["I prefer TypeScript"],
              updatedAt: Date.now(),
            },
          ],
          patterns: [],
          workflows: [],
        });
      });

      const client = makeClient([
        { info: { role: "user" }, parts: [{ type: "text", text: "I prefer TypeScript for all projects" }] },
        { info: { role: "user" }, parts: [{ type: "text", text: "Always use strict mode" }] },
        { info: { role: "user" }, parts: [{ type: "text", text: "Run tests before committing" }] },
      ]);

      const extractor = createProfileExtractor({
        client,
        aiService: mockAiService,
        profileStore,
        config: makeConfig({ profileExtractionMinPrompts: 3 }),
        logger,
      });

      try {
        await extractor.extract("ses_integ_5");

        expect(mockAiService.complete as ReturnType<typeof mock>).toHaveBeenCalledTimes(1);
        expect(capturedPrompt).toContain("I prefer TypeScript");

      const profile = profileStore.getProfile();
        expect(profile).not.toBeNull();
        expect(profile!.preferences[0]?.key).toBe("language");
      } finally {
        closeDatabase(db);
      }
    });
  });

  describe("Test 6 — Config loading with env:// secret resolution", () => {
    const configPath = join(homedir(), ".config", "opencode", "opencode-memory.jsonc");
    let originalConfig: string | null = null;

    beforeEach(() => {
      originalConfig = existsSync(configPath) ? readFileSync(configPath, "utf-8") : null;
    });

    afterEach(() => {
      if (originalConfig === null) {
        if (existsSync(configPath)) {
          unlinkSync(configPath);
        }
      } else {
        mkdirSync(join(homedir(), ".config", "opencode"), { recursive: true });
        writeFileSync(configPath, originalConfig, "utf-8");
      }

      delete process.env.INTEGRATION_TEST_SECRET;
    });

    it("resolves env:// prefix in aiApiKey to environment variable value", () => {
      process.env.INTEGRATION_TEST_SECRET = "test-secret-value-integ";
      mkdirSync(join(homedir(), ".config", "opencode"), { recursive: true });
      writeFileSync(
        configPath,
        JSON.stringify({ aiApiKey: "env://INTEGRATION_TEST_SECRET" }),
        "utf-8"
      );

      const config = getConfig("/test/integration");

      expect(config.aiApiKey).toBe("test-secret-value-integ");
    });
  });

  describe("Test 7 — createAiService factory backend selection", () => {
    let originalFetch: typeof globalThis.fetch;

    beforeEach(() => {
      originalFetch = globalThis.fetch;
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    it("selects host backend when aiApiUrl is empty", async () => {
      const promptMock = mock(async () => "host-response");
      const service = createAiService({
        client: { session: { prompt: promptMock } },
        config: {},
        logger: { debug: mock(() => {}), error: mock(() => {}) },
      });

      expect(service.isConfigured()).toBe(true);

      const result = await service.complete("test prompt");
      expect(result).toBe("host-response");
      expect(promptMock).toHaveBeenCalledTimes(1);
    });

    it("selects independent backend when aiApiUrl and aiApiKey are set", async () => {
      const promptMock = mock(async () => "host-unused");
      let fetchCalled = false;

      globalThis.fetch = mock(async () => {
        fetchCalled = true;
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: "independent-response" } }],
          })
        );
      }) as unknown as typeof globalThis.fetch;

      const service = createAiService({
        client: { session: { prompt: promptMock } },
        config: {
          aiApiUrl: "http://localhost:11434/v1/chat/completions",
          aiApiKey: "ollama",
          aiModel: "llama3",
        },
        logger: { debug: mock(() => {}), error: mock(() => {}) },
      });

      expect(service.isConfigured()).toBe(true);

      const result = await service.complete("test");
      expect(result).toBe("independent-response");
      expect(fetchCalled).toBe(true);
      expect(promptMock).not.toHaveBeenCalled();
    });
  });
});
