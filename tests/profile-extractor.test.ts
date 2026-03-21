import { beforeEach, describe, expect, mock, test } from "bun:test";
import { createDatabase } from "../src/services/database";
import { createProfileStore } from "../src/services/profile-store";
import { createProfileExtractor } from "../src/services/profile-extractor";
import type { PluginConfig } from "../src/types";

function makeConfig(overrides: Partial<PluginConfig> = {}): PluginConfig {
  return {
    embeddingApiUrl: "http://test",
    embeddingApiKey: "",
    embeddingModel: "test-model",
    embeddingDimensions: 1536,
    storagePath: "/tmp/opencode-memory",
    searchLimit: 5,
    contextLimit: 3,
    embeddingBackend: "auto",
    localModel: "",
    localDtype: "",
    localCacheDir: "",
    privacyPatterns: [],
    dedupSimilarityThreshold: 0.7,
    autoCaptureEnabled: false,
    autoCaptureDelay: 0,
    autoCaptureMinImportance: 6,
    searchLayersEnabled: true,
    profileEnabled: true,
    profileExtractionMinPrompts: 3,
    profileMaxMessagesPerExtraction: 10,
    webServerPort: 18080,
    ...overrides,
  };
}

function makeMessage(role: "user" | "assistant", text: string) {
  return {
    info: { role },
    parts: [{ type: "text", text }],
  };
}

describe("ProfileExtractor", () => {
  let db: ReturnType<typeof createDatabase>;
  let profileStore: ReturnType<typeof createProfileStore>;
  let mockLogger: {
    error: ReturnType<typeof mock>;
    info: ReturnType<typeof mock>;
    debug: ReturnType<typeof mock>;
    warn: ReturnType<typeof mock>;
  };

  beforeEach(() => {
    db = createDatabase(":memory:", 0);
    profileStore = createProfileStore(db);
    mockLogger = {
      error: mock(() => {}),
      info: mock(() => {}),
      debug: mock(() => {}),
      warn: mock(() => {}),
    };
  });

  describe("extract threshold guard", () => {
    test("does not call session.prompt when below minPrompts", async () => {
      const promptMock = mock(async () => "{}");
      const client = {
        session: {
          messages: mock(async () => [makeMessage("user", "only one user message")]),
          prompt: promptMock,
        },
      };

      const extractor = createProfileExtractor({
        client,
        profileStore,
        config: makeConfig({ profileExtractionMinPrompts: 3 }),
        logger: mockLogger,
      });

      await extractor.extract("session-1");
      expect(promptMock).not.toHaveBeenCalled();
    });

    test("calls session.prompt when at or above minPrompts", async () => {
      const promptMock = mock(async () =>
        JSON.stringify({
          preferences: [
            {
              key: "lang",
              value: "TypeScript",
              confidence: 0.9,
              evidence: ["I prefer TypeScript"],
              updatedAt: Date.now(),
            },
          ],
          patterns: [],
          workflows: [],
        })
      );

      const client = {
        session: {
          messages: mock(async () => [
            makeMessage("user", "I prefer TypeScript"),
            makeMessage("user", "Always use ESLint"),
            makeMessage("user", "Keep code clean"),
          ]),
          prompt: promptMock,
        },
      };

      const extractor = createProfileExtractor({
        client,
        profileStore,
        config: makeConfig({ profileExtractionMinPrompts: 3 }),
        logger: mockLogger,
      });

      await extractor.extract("session-1");
      expect(promptMock).toHaveBeenCalledTimes(1);
    });
  });

  describe("extract user-only filter", () => {
    test("filters out assistant messages and only analyzes user text", async () => {
      let capturedPrompt = "";
      const promptMock = mock(async (promptText: string) => {
        capturedPrompt = promptText;
        return JSON.stringify({ preferences: [], patterns: [], workflows: [] });
      });

      const client = {
        session: {
          messages: mock(async () => [
            makeMessage("user", "I prefer TypeScript"),
            makeMessage("assistant", "Sure, I can help with TypeScript"),
            makeMessage("user", "Always use ESLint"),
            makeMessage("user", "Keep code clean"),
          ]),
          prompt: promptMock,
        },
      };

      const extractor = createProfileExtractor({
        client,
        profileStore,
        config: makeConfig({ profileExtractionMinPrompts: 3 }),
        logger: mockLogger,
      });

      await extractor.extract("session-1");
      expect(capturedPrompt).not.toContain("Sure, I can help");
      expect(capturedPrompt).toContain("I prefer TypeScript");
    });
  });

  describe("extract max messages limit", () => {
    test("limits analyzed messages to configured tail window", async () => {
      let capturedPrompt = "";
      const promptMock = mock(async (promptText: string) => {
        capturedPrompt = promptText;
        return JSON.stringify({ preferences: [], patterns: [], workflows: [] });
      });

      const messages = Array.from({ length: 20 }, (_, index) => {
        const label = String(index + 1).padStart(2, "0");
        return makeMessage("user", `Msg#${label}`);
      });

      const client = {
        session: {
          messages: mock(async () => messages),
          prompt: promptMock,
        },
      };

      const extractor = createProfileExtractor({
        client,
        profileStore,
        config: makeConfig({ profileExtractionMinPrompts: 3, profileMaxMessagesPerExtraction: 5 }),
        logger: mockLogger,
      });

      await extractor.extract("session-1");
      expect(capturedPrompt).not.toContain("Msg#01");
      expect(capturedPrompt).toContain("Msg#16");
      expect(capturedPrompt).toContain("Msg#20");
    });
  });

  describe("extract profile merge", () => {
    test("merges extracted profile into profile store", async () => {
      const client = {
        session: {
          messages: mock(async () => [
            makeMessage("user", "I prefer TypeScript"),
            makeMessage("user", "Always use TDD"),
            makeMessage("user", "Keep code clean"),
          ]),
          prompt: mock(async () =>
            JSON.stringify({
              preferences: [
                {
                  key: "lang",
                  value: "TypeScript",
                  confidence: 0.85,
                  evidence: ["I prefer TS"],
                  updatedAt: Date.now(),
                },
              ],
              patterns: [
                {
                  key: "tdd",
                  description: "Test-driven",
                  frequency: 3,
                  lastSeen: Date.now(),
                },
              ],
              workflows: [],
            })
          ),
        },
      };

      const extractor = createProfileExtractor({
        client,
        profileStore,
        config: makeConfig({ profileExtractionMinPrompts: 3 }),
        logger: mockLogger,
      });

      await extractor.extract("session-1");

      const profile = profileStore.getProfile();
      expect(profile).not.toBeNull();
      expect(profile!.preferences).toHaveLength(1);
      expect(profile!.preferences[0].key).toBe("lang");
      expect(profile!.patterns).toHaveLength(1);
      expect(profile!.patterns[0].key).toBe("tdd");
    });
  });

  describe("extract error handling", () => {
    test("does not throw when session.prompt fails", async () => {
      const client = {
        session: {
          messages: mock(async () => [
            makeMessage("user", "I prefer TypeScript"),
            makeMessage("user", "Always use TDD"),
            makeMessage("user", "Keep code clean"),
          ]),
          prompt: mock(async () => {
            throw new Error("AI service unavailable");
          }),
        },
      };

      const extractor = createProfileExtractor({
        client,
        profileStore,
        config: makeConfig({ profileExtractionMinPrompts: 3 }),
        logger: mockLogger,
      });

      await extractor.extract("session-1");
      expect(mockLogger.error).toHaveBeenCalledTimes(1);
    });

    test("does not throw when JSON response is malformed", async () => {
      const client = {
        session: {
          messages: mock(async () => [
            makeMessage("user", "I prefer TypeScript"),
            makeMessage("user", "Always use TDD"),
            makeMessage("user", "Keep code clean"),
          ]),
          prompt: mock(async () => "not valid json"),
        },
      };

      const extractor = createProfileExtractor({
        client,
        profileStore,
        config: makeConfig({ profileExtractionMinPrompts: 3 }),
        logger: mockLogger,
      });

      await extractor.extract("session-1");
      expect(mockLogger.error).toHaveBeenCalledTimes(1);
    });
  });
});
