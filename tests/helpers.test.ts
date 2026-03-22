import { describe, it, expect } from "bun:test";
import {
  makeConfig,
  makeMockStore,
  makeMockProfileStore,
  makeMockLogger,
  makeTestMemory,
} from "./helpers.js";
import type { PluginConfig, Memory } from "../src/types.js";
import type { MemoryStore } from "../src/services/memory-store.js";
import type { ProfileStore } from "../src/services/profile-store.js";
import type { Logger } from "../src/services/logger.js";

describe("Test Helpers", () => {
  // ============================================
  // makeConfig tests
  // ============================================

  it("makeConfig() returns a complete PluginConfig with all required fields", () => {
    const config = makeConfig();

    // Check all 25+ required fields exist and have expected types
    expect(config.storagePath).toBeString();
    expect(config.searchLimit).toBeNumber();
    expect(config.contextLimit).toBeNumber();
    expect(config.embeddingBackend).toBeString();
    expect(config.embeddingApiUrl).toBeString();
    expect(config.embeddingApiKey).toBeString();
    expect(config.embeddingModel).toBeString();
    expect(config.embeddingDimensions).toBeNumber();
    expect(config.localModel).toBeString();
    expect(config.localDtype).toBeString();
    expect(config.localCacheDir).toBeString();
    expect(Array.isArray(config.privacyPatterns)).toBe(true);
    expect(config.dedupSimilarityThreshold).toBeNumber();
    expect(config.autoCaptureEnabled).toBeBoolean();
    expect(config.autoCaptureDelay).toBeNumber();
    expect(config.autoCaptureMinImportance).toBeNumber();
    expect(config.searchLayersEnabled).toBeBoolean();
    expect(config.profileEnabled).toBeBoolean();
    expect(config.profileExtractionMinPrompts).toBeNumber();
    expect(config.profileMaxMessagesPerExtraction).toBeNumber();
    expect(config.webServerPort).toBeNumber();
    expect(config.logLevel).toBeString();
  });

  it("makeConfig({ searchLimit: 99 }) overrides specified field", () => {
    const config = makeConfig({ searchLimit: 99 });

    // Verify searchLimit is overridden
    expect(config.searchLimit).toBe(99);

    // Verify other defaults are still intact
    expect(config.storagePath).toBeString();
    expect(config.contextLimit).toBeNumber();
    expect(config.embeddingModel).toBeString();
  });

  // ============================================
  // makeMockStore tests
  // ============================================

  it("makeMockStore() returns an object with all MemoryStore methods", () => {
    const store = makeMockStore();

    expect(typeof store.add).toBe("function");
    expect(typeof store.search).toBe("function");
    expect(typeof store.list).toBe("function");
    expect(typeof store.forget).toBe("function");
    expect(typeof store.get).toBe("function");
    expect(typeof store.retryPendingEmbeddings).toBe("function");
    expect(typeof (store as any).exportAll).toBe("function");
    expect(typeof (store as any).importMemories).toBe("function");
    expect(typeof (store as any).getStats).toBe("function");
    expect(typeof (store as any).recordSearchHit).toBe("function");
  });

  it("makeMockStore with search override returns custom results", async () => {
    const customResults = [];
    const store = makeMockStore({
      search: async () => customResults,
    });

    // Call search and verify it returns the custom empty array
    const results = await store.search("test query");
    expect(results).toBe(customResults);
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBe(0);
  });

  // ============================================
  // makeMockProfileStore tests
  // ============================================

  it("makeMockProfileStore() returns an object with profile store methods", () => {
    const profileStore = makeMockProfileStore();

    // Check that profile store methods exist
    expect(typeof profileStore.getProfile).toBe("function");
    expect(typeof profileStore.saveProfile).toBe("function");
  });

  // ============================================
  // makeMockLogger tests
  // ============================================

  it("makeMockLogger() returns a logger with all 4 methods", () => {
    const logger = makeMockLogger();

    // Check all 4 Logger methods exist as functions
    expect(typeof logger.debug).toBe("function");
    expect(typeof logger.info).toBe("function");
    expect(typeof logger.warn).toBe("function");
    expect(typeof logger.error).toBe("function");
  });

  // ============================================
  // makeTestMemory tests
  // ============================================

  it("makeTestMemory() returns a complete Memory object", () => {
    const memory = makeTestMemory();

    // Check all Memory fields exist and have expected types
    expect(memory.id).toBeString();
    expect(memory.content).toBeString();
    expect(memory.tags).toBeString();
    expect(memory.type).toBeString();
    expect(typeof memory.metadata).toBe("object");
    expect(memory.embeddingStatus).toBeString();
    expect(memory.createdAt).toBeNumber();
    expect(memory.updatedAt).toBeNumber();
  });

  it("makeTestMemory({ type: 'decision' }) overrides type field", () => {
    const memory = makeTestMemory({ type: "decision" });

    // Verify type is overridden to 'decision'
    expect(memory.type).toBe("decision");

    // Verify other fields are still populated
    expect(memory.id).toBeString();
    expect(memory.content).toBeString();
    expect(memory.createdAt).toBeNumber();
  });
});
