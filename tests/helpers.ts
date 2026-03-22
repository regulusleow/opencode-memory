import { mock } from "bun:test";
import type { PluginConfig, Memory } from "../src/types.js";
import type { MemoryStore } from "../src/services/memory-store.js";
import type { ProfileStore } from "../src/services/profile-store.js";
import type { Logger } from "../src/services/logger.js";

/**
 * Create a PluginConfig with default values for all required fields.
 * Merges provided overrides into the defaults.
 */
export function makeConfig(overrides?: Partial<PluginConfig>): PluginConfig {
  const defaults = {
    embeddingApiUrl: "http://test",
    embeddingApiKey: "",
    embeddingModel: "test",
    embeddingDimensions: 1536,
    storagePath: "/tmp",
    searchLimit: 20,
    contextLimit: 5,
    embeddingBackend: "auto" as const,
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
    logLevel: "info" as const,
  } satisfies PluginConfig;

  return {
    ...defaults,
    ...overrides,
  };
}

/**
 * Create a mock MemoryStore with all 6 methods.
 * Merges provided overrides into the defaults.
 */
export function makeMockStore(overrides?: Partial<MemoryStore>): MemoryStore {
  const testMemory: Memory = {
    id: "test-memory-id",
    content: "Test memory content",
    tags: "test",
    type: "general",
    metadata: {},
    embeddingStatus: "done",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  const defaults: MemoryStore = {
    add: mock(() => Promise.resolve(testMemory)),
    search: mock(() => Promise.resolve([])),
    list: mock(() => Promise.resolve([])),
    forget: mock(() => Promise.resolve(false)),
    get: mock(() => Promise.resolve(null)),
    retryPendingEmbeddings: mock(() => Promise.resolve(0)),
  };

  return {
    ...defaults,
    ...overrides,
  };
}

/**
 * Create a mock ProfileStore with all 8 methods.
 * Merges provided overrides into the defaults.
 */
export function makeMockProfileStore(
  overrides?: Partial<ProfileStore>
): ProfileStore {
  const defaults: ProfileStore = {
    getProfile: mock(() => null),
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

  return {
    ...defaults,
    ...overrides,
  };
}

/**
 * Create a mock Logger with all 4 methods.
 */
export function makeMockLogger(): Logger {
  return {
    debug: mock(() => {}),
    info: mock(() => {}),
    warn: mock(() => {}),
    error: mock(() => {}),
  };
}

/**
 * Create a test Memory object with all required fields.
 * Merges provided overrides into the defaults.
 */
export function makeTestMemory(overrides?: Partial<Memory>): Memory {
  const defaults: Memory = {
    id: "test-memory-id",
    content: "Test memory content",
    tags: "test",
    type: "general",
    metadata: {},
    embeddingStatus: "done",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  return {
    ...defaults,
    ...overrides,
  };
}
