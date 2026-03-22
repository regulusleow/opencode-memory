import { describe, expect, it } from "bun:test";
import type {
  PluginConfig,
  AiExtractionResult,
  AiService,
} from "../src/types";

describe("types module", () => {
  describe("PluginConfig", () => {
    it("should have all required fields", () => {
      const config: PluginConfig = {
        embeddingApiUrl: "https://api.openai.com/v1/embeddings",
        embeddingApiKey: "sk-test",
        embeddingModel: "text-embedding-3-small",
        embeddingDimensions: 1536,
        storagePath: "/tmp/memory",
        searchLimit: 5,
        contextLimit: 3,
        embeddingBackend: "api",
        localModel: "nomic-ai/nomic-embed-text-v1.5",
        localDtype: "q8",
        localCacheDir: "/tmp/cache",
        privacyPatterns: [],
        dedupSimilarityThreshold: 0.7,
        autoCaptureEnabled: true,
        autoCaptureDelay: 10000,
        autoCaptureMinImportance: 6,
        searchLayersEnabled: true,
        profileEnabled: true,
        profileExtractionMinPrompts: 5,
        profileMaxMessagesPerExtraction: 20,
        webServerPort: 18080,
        logLevel: "info",
      };
      expect(config).toBeDefined();
      expect(config.embeddingModel).toBe("text-embedding-3-small");
    });

    it("should have optional AI provider fields", () => {
      const config: PluginConfig = {
        embeddingApiUrl: "https://api.openai.com/v1/embeddings",
        embeddingApiKey: "sk-test",
        embeddingModel: "text-embedding-3-small",
        embeddingDimensions: 1536,
        storagePath: "/tmp/memory",
        searchLimit: 5,
        contextLimit: 3,
        embeddingBackend: "api",
        localModel: "nomic-ai/nomic-embed-text-v1.5",
        localDtype: "q8",
        localCacheDir: "/tmp/cache",
        privacyPatterns: [],
        dedupSimilarityThreshold: 0.7,
        autoCaptureEnabled: true,
        autoCaptureDelay: 10000,
        autoCaptureMinImportance: 6,
        searchLayersEnabled: true,
        profileEnabled: true,
        profileExtractionMinPrompts: 5,
        profileMaxMessagesPerExtraction: 20,
        webServerPort: 18080,
        logLevel: "info",
        aiApiUrl: "https://api.anthropic.com",
        aiApiKey: "file://env:AI_API_KEY",
        aiModel: "claude-3-sonnet",
        autoCaptureMode: "hybrid",
      };
      expect(config.aiApiUrl).toBe("https://api.anthropic.com");
      expect(config.aiApiKey).toBe("file://env:AI_API_KEY");
      expect(config.aiModel).toBe("claude-3-sonnet");
      expect(config.autoCaptureMode).toBe("hybrid");
    });

    it("should allow missing optional AI fields", () => {
      const config: PluginConfig = {
        embeddingApiUrl: "https://api.openai.com/v1/embeddings",
        embeddingApiKey: "sk-test",
        embeddingModel: "text-embedding-3-small",
        embeddingDimensions: 1536,
        storagePath: "/tmp/memory",
        searchLimit: 5,
        contextLimit: 3,
        embeddingBackend: "api",
        localModel: "nomic-ai/nomic-embed-text-v1.5",
        localDtype: "q8",
        localCacheDir: "/tmp/cache",
        privacyPatterns: [],
        dedupSimilarityThreshold: 0.7,
        autoCaptureEnabled: true,
        autoCaptureDelay: 10000,
        autoCaptureMinImportance: 6,
        searchLayersEnabled: true,
        profileEnabled: true,
        profileExtractionMinPrompts: 5,
        profileMaxMessagesPerExtraction: 20,
        webServerPort: 18080,
        logLevel: "info",
      };
      expect(config.aiApiUrl).toBeUndefined();
      expect(config.aiModel).toBeUndefined();
      expect(config.autoCaptureMode).toBeUndefined();
    });
  });

  describe("AiExtractionResult", () => {
    it("should have memories array with content and tags", () => {
      const result: AiExtractionResult = {
        memories: [
          {
            content: "User prefers TypeScript",
            tags: "preference,language",
          },
          {
            content: "Uses macOS for development",
            tags: "environment,os",
          },
        ],
      };
      expect(result.memories).toHaveLength(2);
      expect(result.memories[0].content).toBe("User prefers TypeScript");
      expect(result.memories[0].tags).toBe("preference,language");
    });

    it("should allow empty memories array", () => {
      const result: AiExtractionResult = {
        memories: [],
      };
      expect(result.memories).toHaveLength(0);
    });
  });

  describe("AiService", () => {
    it("should define complete and isConfigured methods", () => {
      const mockService: AiService = {
        complete: async (prompt: string, jsonSchema?: Record<string, unknown>) => {
          return JSON.stringify({ test: true });
        },
        isConfigured: () => true,
      };
      expect(typeof mockService.complete).toBe("function");
      expect(typeof mockService.isConfigured).toBe("function");
    });

    it("complete should accept optional jsonSchema", async () => {
      const mockService: AiService = {
        complete: async (prompt: string, jsonSchema?: Record<string, unknown>) => {
          if (jsonSchema) {
            return JSON.stringify({ schema: true });
          }
          return JSON.stringify({ noSchema: true });
        },
        isConfigured: () => true,
      };
      const result1 = await mockService.complete("test prompt");
      const result2 = await mockService.complete("test prompt", { type: "object" });
      expect(result1).toBe(JSON.stringify({ noSchema: true }));
      expect(result2).toBe(JSON.stringify({ schema: true }));
    });

    it("isConfigured should return boolean", () => {
      const mockService: AiService = {
        complete: async () => "",
        isConfigured: () => false,
      };
      expect(typeof mockService.isConfigured()).toBe("boolean");
    });
  });
});
