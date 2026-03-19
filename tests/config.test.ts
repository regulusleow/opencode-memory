import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import {
  getConfig,
  getProjectStoragePath,
  generateMemoryId,
} from "../src/config";

describe("config module", () => {
  const originalEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    // Save original env vars
    const envVars = [
      "OPENCODE_MEMORY_EMBEDDING_API_URL",
      "OPENCODE_MEMORY_EMBEDDING_API_KEY",
      "OPENCODE_MEMORY_EMBEDDING_MODEL",
      "OPENCODE_MEMORY_EMBEDDING_DIMENSIONS",
      "OPENCODE_MEMORY_STORAGE_PATH",
      "OPENCODE_MEMORY_SEARCH_LIMIT",
      "OPENCODE_MEMORY_CONTEXT_LIMIT",
    ];
    envVars.forEach((key) => {
      originalEnv[key] = process.env[key];
      delete process.env[key];
    });
  });

  afterEach(() => {
    // Restore original env vars
    Object.entries(originalEnv).forEach(([key, value]) => {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    });
  });

  describe("getConfig", () => {
    it("should return default config values when no env vars set", () => {
      const config = getConfig("/test/project");

      expect(config.embeddingApiUrl).toBe("https://api.openai.com/v1/embeddings");
      expect(config.embeddingApiKey).toBe("");
      expect(config.embeddingModel).toBe("text-embedding-3-small");
      expect(config.embeddingDimensions).toBe(1536);
      expect(config.searchLimit).toBe(5);
      expect(config.contextLimit).toBe(3);
    });

    it("should override embeddingApiUrl with env var", () => {
      process.env.OPENCODE_MEMORY_EMBEDDING_API_URL =
        "https://custom.example.com/embeddings";
      const config = getConfig("/test/project");

      expect(config.embeddingApiUrl).toBe("https://custom.example.com/embeddings");
    });

    it("should override embeddingApiKey with env var", () => {
      process.env.OPENCODE_MEMORY_EMBEDDING_API_KEY = "test-key-123";
      const config = getConfig("/test/project");

      expect(config.embeddingApiKey).toBe("test-key-123");
    });

    it("should override embeddingModel with env var", () => {
      process.env.OPENCODE_MEMORY_EMBEDDING_MODEL = "custom-model";
      const config = getConfig("/test/project");

      expect(config.embeddingModel).toBe("custom-model");
    });

    it("should override embeddingDimensions with env var", () => {
      process.env.OPENCODE_MEMORY_EMBEDDING_DIMENSIONS = "3072";
      const config = getConfig("/test/project");

      expect(config.embeddingDimensions).toBe(3072);
    });

    it("should override storagePath with env var", () => {
      process.env.OPENCODE_MEMORY_STORAGE_PATH = "/custom/storage/path";
      const config = getConfig("/test/project");

      expect(config.storagePath).toBe("/custom/storage/path");
    });

    it("should override searchLimit with env var", () => {
      process.env.OPENCODE_MEMORY_SEARCH_LIMIT = "10";
      const config = getConfig("/test/project");

      expect(config.searchLimit).toBe(10);
    });

    it("should override contextLimit with env var", () => {
      process.env.OPENCODE_MEMORY_CONTEXT_LIMIT = "5";
      const config = getConfig("/test/project");

      expect(config.contextLimit).toBe(5);
    });
  });

  describe("getProjectStoragePath", () => {
    it("should produce consistent hash for same project path", () => {
      const projectPath = "/Users/test/project";
      const storagePath = "/storage";

      const path1 = getProjectStoragePath(storagePath, projectPath);
      const path2 = getProjectStoragePath(storagePath, projectPath);

      expect(path1).toBe(path2);
    });

    it("should produce different hash for different project paths", () => {
      const storagePath = "/storage";
      const projectPath1 = "/Users/test/project1";
      const projectPath2 = "/Users/test/project2";

      const path1 = getProjectStoragePath(storagePath, projectPath1);
      const path2 = getProjectStoragePath(storagePath, projectPath2);

      expect(path1).not.toBe(path2);
    });

    it("should contain storage path prefix", () => {
      const storagePath = "/storage";
      const projectPath = "/Users/test/project";

      const path = getProjectStoragePath(storagePath, projectPath);

      expect(path).toContain(storagePath);
      expect(path).toContain("memory.db");
    });

    it("should produce 12-character hash component", () => {
      const storagePath = "/storage";
      const projectPath = "/Users/test/project";

      const path = getProjectStoragePath(storagePath, projectPath);
      const hashComponent = path.split("/").slice(-2, -1)[0];

      expect(hashComponent?.length).toBe(12);
    });
  });

  describe("generateMemoryId", () => {
    it("should have mem_ prefix", () => {
      const id = generateMemoryId();

      expect(id).toMatch(/^mem_/);
    });

    it("should have format mem_<timestamp>_<random>", () => {
      const id = generateMemoryId();
      const parts = id.split("_");

      expect(parts.length).toBe(3);
      expect(parts[0]).toBe("mem");
      expect(parts[1]).toMatch(/^\d+$/); // timestamp is numeric
      expect(parts[2]?.length).toBe(8); // random UUID slice is 8 chars
    });

    it("should produce unique IDs", () => {
      const id1 = generateMemoryId();
      const id2 = generateMemoryId();

      expect(id1).not.toBe(id2);
    });

    it("should produce unique IDs even when called immediately", () => {
      const ids = new Set();
      for (let i = 0; i < 100; i++) {
        ids.add(generateMemoryId());
      }

      expect(ids.size).toBe(100);
    });
  });
});
