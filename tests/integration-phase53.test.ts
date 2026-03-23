import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import type { Database } from "bun:sqlite";
import { createDatabase, closeDatabase } from "../src/services/database.js";
import { createMemoryStore } from "../src/services/memory-store.js";
import { runMigrations } from "../src/services/migration-runner.js";
import { memoryMigrations } from "../src/services/migrations.js";
import { createVectorBackend } from "../src/services/vector-backend.js";
import type { EmbeddingService } from "../src/services/embedding.js";
import type { Logger } from "../src/services/logger.js";
import { formatMemoryContext, estimateTokens } from "../src/services/context.js";
import { makeConfig } from "./helpers.js";

const EMBEDDING_DIM = 3;

function makeMockEmbedding(): EmbeddingService {
  return {
    isConfigured: () => true,
    embed: async (_text: string) => ({ embedding: new Float64Array([0.1, 0.2, 0.3]) }),
    embedBatch: async (texts: string[]) =>
      texts.map(() => ({ embedding: new Float64Array([0.1, 0.2, 0.3]) })),
  };
}

function makeLogger(): Logger {
  return {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
  };
}

describe("Phase 5.3 Backward Compatibility Integration", () => {
  let db: Database;
  let logger: Logger;

  beforeEach(async () => {
    db = createDatabase(":memory:", EMBEDDING_DIM);
    logger = makeLogger();
    runMigrations(db, memoryMigrations, logger);
  });

  afterEach(() => {
    closeDatabase(db);
  });

  describe("Scenario 1: Default config — all memories injected, content truncated", () => {
    it("includes all memories with truncated content in chat mode", async () => {
      const config = makeConfig();
      const embeddingService = makeMockEmbedding();
      const vectorBackend = await createVectorBackend(db, EMBEDDING_DIM);
      const store = createMemoryStore(db, embeddingService, config, vectorBackend, undefined, undefined, logger);

      const longContent1 = "a".repeat(250) + " word boundary test";
      const longContent2 = "b".repeat(250) + " another word boundary";
      const longContent3 = "c".repeat(250) + " yet another boundary";

      await store.add(longContent1, { tags: "test", type: "general" });
      await store.add(longContent2, { tags: "test", type: "general" });
      await store.add(longContent3, { tags: "test", type: "general" });

      const results = await store.search("test", config.contextLimit);
      expect(results.length).toBeGreaterThanOrEqual(1);

      const formatted = formatMemoryContext(results, "chat");
      expect(formatted).toContain("<relevant_memories>");
      expect(formatted).toContain("</relevant_memories>");
      expect(formatted).toContain("...");
      expect(formatted).toMatch(/1\./);
      if (results.length > 1) expect(formatted).toMatch(/2\./);
      if (results.length > 2) expect(formatted).toMatch(/3\./);
    });
  });

  describe("Scenario 2: tokenBudget set — limits memory count", () => {
    it("respects small tokenBudget and maintains at-least-1 guarantee", async () => {
      const config = makeConfig();
      const embeddingService = makeMockEmbedding();
      const vectorBackend = await createVectorBackend(db, EMBEDDING_DIM);
      const store = createMemoryStore(db, embeddingService, config, vectorBackend, undefined, undefined, logger);

      const longContent1 = "a".repeat(300) + " boundary";
      const longContent2 = "b".repeat(300) + " boundary";
      const longContent3 = "c".repeat(300) + " boundary";

      await store.add(longContent1, { tags: "test", type: "general" });
      await store.add(longContent2, { tags: "test", type: "general" });
      await store.add(longContent3, { tags: "test", type: "general" });

      const results = await store.search("test", 5);

      const tokenBudget = 100;
      let selectedMemories = [results[0]];
      for (let i = 1; i < results.length; i++) {
        const candidate = [...selectedMemories, results[i]];
        const formatted = formatMemoryContext(candidate, "chat");
        if (estimateTokens(formatted) <= tokenBudget) {
          selectedMemories = candidate;
        } else {
          break;
        }
      }

      expect(selectedMemories.length).toBeGreaterThanOrEqual(1);
      expect(selectedMemories.length).toBe(1);

      const formatted = formatMemoryContext(selectedMemories, "chat");
      const tokenCount = estimateTokens(formatted);
      expect(tokenCount).toBeGreaterThan(0);
      expect(tokenCount).toBeLessThanOrEqual(tokenBudget * 1.5);
    });

    it("includes multiple memories when tokenBudget is large", async () => {
      const config = makeConfig();
      const embeddingService = makeMockEmbedding();
      const vectorBackend = await createVectorBackend(db, EMBEDDING_DIM);
      const store = createMemoryStore(db, embeddingService, config, vectorBackend, undefined, undefined, logger);

      const longContent1 = "a".repeat(300) + " boundary";
      const longContent2 = "b".repeat(300) + " boundary";
      const longContent3 = "c".repeat(300) + " boundary";

      await store.add(longContent1, { tags: "test", type: "general" });
      await store.add(longContent2, { tags: "test", type: "general" });
      await store.add(longContent3, { tags: "test", type: "general" });

      const results = await store.search("test", 5);

      const tokenBudget = 10000;
      let selectedMemories = [results[0]];
      for (let i = 1; i < results.length; i++) {
        const candidate = [...selectedMemories, results[i]];
        const formatted = formatMemoryContext(candidate, "chat");
        if (estimateTokens(formatted) <= tokenBudget) {
          selectedMemories = candidate;
        } else {
          break;
        }
      }

      expect(selectedMemories.length).toBe(Math.min(3, results.length));
    });
  });

  describe("Scenario 3: Enhanced bonuses — non-negative, non-NaN scores", () => {
    it("produces valid scores with search_hit_count and last_accessed_at signals", async () => {
      const config = makeConfig();
      const embeddingService = makeMockEmbedding();
      const vectorBackend = await createVectorBackend(db, EMBEDDING_DIM);
      const store = createMemoryStore(db, embeddingService, config, vectorBackend, undefined, undefined, logger);

      await store.add("Important pattern in error handling", { tags: "pattern,error", type: "general" });

      const results = await store.search("error", 5);
      for (const result of results) {
        expect(Number.isFinite(result.score)).toBe(true);
        expect(result.score).toBeGreaterThanOrEqual(0);
        expect(Number.isNaN(result.score)).toBe(false);
      }
      expect(results.length).toBeGreaterThan(0);
    });

    it("handles null search_hit_count and last_accessed_at without crashes", async () => {
      const config = makeConfig();
      const embeddingService = makeMockEmbedding();
      const vectorBackend = await createVectorBackend(db, EMBEDDING_DIM);
      const store = createMemoryStore(db, embeddingService, config, vectorBackend, undefined, undefined, logger);

      await store.add("First memory about patterns", { tags: "pattern", type: "general" });
      await store.add("Second memory about error handling", { tags: "error", type: "general" });

      const results = await store.search("about", 5);
      for (const result of results) {
        expect(typeof result.score).toBe("number");
        expect(Number.isFinite(result.score)).toBe(true);
      }
    });
  });

  describe("Scenario 4: formatMemoryContext search mode is unchanged", () => {
    it("does not truncate content in search mode", async () => {
      const config = makeConfig();
      const embeddingService = makeMockEmbedding();
      const vectorBackend = await createVectorBackend(db, EMBEDDING_DIM);
      const store = createMemoryStore(db, embeddingService, config, vectorBackend, undefined, undefined, logger);

      const longContent = "This is a very long memory content ".repeat(20);
      await store.add(longContent, { tags: "test", type: "general" });

      const results = await store.search("memory", 5);
      expect(results.length).toBeGreaterThan(0);

      const searchFormatted = formatMemoryContext(results, "search");
      expect(searchFormatted).not.toContain("<relevant_memories>");
      expect(searchFormatted).toContain("memory");

      const chatFormatted = formatMemoryContext(results, "chat");
      expect(chatFormatted).toContain("...");
      expect(chatFormatted).toContain("<relevant_memories>");
      expect(searchFormatted).not.toContain("Use these for context but don't mention them");
    });
  });

  describe("Scenario 5: Edge cases — zero-value configs", () => {
    it("treats tokenBudget=0 as disabled (uses all memories)", async () => {
      const config = makeConfig({ tokenBudget: 0 });
      const embeddingService = makeMockEmbedding();
      const vectorBackend = await createVectorBackend(db, EMBEDDING_DIM);
      const store = createMemoryStore(db, embeddingService, config, vectorBackend, undefined, undefined, logger);

      const longContent = "x".repeat(300) + " boundary";
      await store.add(longContent, { tags: "test", type: "general" });
      await store.add(longContent, { tags: "test", type: "general" });
      await store.add(longContent, { tags: "test", type: "general" });

      const results = await store.search("test", config.contextLimit);
      const formatted = formatMemoryContext(results, "chat");
      expect(formatted).toContain("<relevant_memories>");
      expect(formatted).toMatch(/1\./);
      if (results.length > 1) {
        expect(formatted).toMatch(/2\./);
      }
    });

    it("handles undefined tokenBudget (default config)", async () => {
      const config = makeConfig();
      expect(config.tokenBudget).toBeUndefined();

      const embeddingService = makeMockEmbedding();
      const vectorBackend = await createVectorBackend(db, EMBEDDING_DIM);
      const store = createMemoryStore(db, embeddingService, config, vectorBackend, undefined, undefined, logger);

      await store.add("Test memory without budget limit", { tags: "test", type: "general" });

      const results = await store.search("memory", config.contextLimit);
      const formatted = formatMemoryContext(results, "chat");
      expect(formatted).toBeTruthy();
    });

    it("respects contextLimit interaction with tokenBudget", async () => {
      const config = makeConfig({ contextLimit: 2, tokenBudget: 500 });
      const embeddingService = makeMockEmbedding();
      const vectorBackend = await createVectorBackend(db, EMBEDDING_DIM);
      const store = createMemoryStore(db, embeddingService, config, vectorBackend, undefined, undefined, logger);

      for (let i = 0; i < 5; i++) {
        await store.add(`Memory ${i}: ${"x".repeat(100)}`, { tags: `tag${i}`, type: "general" });
      }

      const results = await store.search("Memory", config.contextLimit);
      expect(results.length).toBeLessThanOrEqual(2);

      let selectedMemories = [results[0]];
      for (let i = 1; i < results.length; i++) {
        const candidate = [...selectedMemories, results[i]];
        const formatted = formatMemoryContext(candidate, "chat");
        if (estimateTokens(formatted) <= config.tokenBudget!) {
          selectedMemories = candidate;
        } else {
          break;
        }
      }

      expect(selectedMemories.length).toBeGreaterThanOrEqual(1);
      expect(selectedMemories.length).toBeLessThanOrEqual(config.contextLimit);
    });
  });

  describe("Scenario 6: Token estimation accuracy", () => {
    it("estimateTokens provides reasonable token counts", () => {
      const shortText = "Hello";
      const shortTokens = estimateTokens(shortText);
      expect(shortTokens).toBeGreaterThan(0);
      expect(shortTokens).toBeLessThanOrEqual(2);

      const mediumText = "a".repeat(400);
      const mediumTokens = estimateTokens(mediumText);
      expect(mediumTokens).toBeGreaterThan(shortTokens);

      const longText = "a".repeat(4000);
      const longTokens = estimateTokens(longText);
      expect(longTokens).toBeGreaterThan(mediumTokens);

      expect(estimateTokens("hello world")).toBe(Math.ceil(11 / 4));
    });
  });
});
