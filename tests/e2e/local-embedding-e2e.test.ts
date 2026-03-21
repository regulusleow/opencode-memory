import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { createLocalEmbeddingBackend } from "../../src/services/local-embedding.js";
import { createDatabase } from "../../src/services/database.js";
import { createVectorBackend } from "../../src/services/vector-backend.js";
import { createMemoryStore } from "../../src/services/memory-store.js";
import type { PluginConfig } from "../../src/types.js";
import { rmSync } from "fs";

const E2E_MODEL = "Xenova/all-MiniLM-L6-v2";
const E2E_DIMENSIONS = 384;

const e2eConfig: PluginConfig = {
  embeddingApiUrl: "https://api.openai.com/v1/embeddings",
  embeddingApiKey: "",
  embeddingModel: "text-embedding-3-small",
  embeddingDimensions: E2E_DIMENSIONS,
  storagePath: "/tmp/e2e-test",
  searchLimit: 10,
  contextLimit: 3,
  embeddingBackend: "local",
  localModel: E2E_MODEL,
  localDtype: "fp32",
  localCacheDir: "/tmp/local-model-cache-e2e",
  privacyPatterns: [],
  dedupSimilarityThreshold: 0.95,
  autoCaptureEnabled: false,
  autoCaptureDelay: 0,
  autoCaptureMinImportance: 0,
  searchLayersEnabled: true,
  profileEnabled: false,
  profileExtractionMinPrompts: 10,
  profileMaxMessagesPerExtraction: 50,
  webServerPort: 0,
  logLevel: "silent",
};

describe.skipIf(!process.env.RUN_E2E)("E2E: Local Embedding (Xenova/all-MiniLM-L6-v2)", () => {
  let backend: ReturnType<typeof createLocalEmbeddingBackend>;
  let tempDbPath: string;

  beforeAll(async () => {
    backend = createLocalEmbeddingBackend(e2eConfig);
    tempDbPath = `/tmp/opencode-memory-e2e-test-${Date.now()}.db`;
    await backend.warmup?.();
  }, 120_000);

  afterAll(() => {
    try {
      rmSync(tempDbPath, { force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it("warmup resolves without error (singleton — model already loaded in beforeAll)", async () => {
    await expect(backend.warmup?.()).resolves.toBeUndefined();
  }, 120_000);

  it("embed returns a Float64Array with length equal to model dimensions (384)", async () => {
    const result = await backend.embed("hello world", "document");

    expect("embedding" in result).toBe(true);
    if ("embedding" in result) {
      expect(result.embedding).toBeInstanceOf(Float64Array);
      expect(result.embedding.length).toBe(E2E_DIMENSIONS);
    }
  }, 30_000);

  it("different texts produce different embedding vectors", async () => {
    const resultA = await backend.embed("The sky is blue", "document");
    const resultB = await backend.embed("SELECT * FROM users WHERE 1=1", "document");

    expect("embedding" in resultA).toBe(true);
    expect("embedding" in resultB).toBe(true);

    if ("embedding" in resultA && "embedding" in resultB) {
      const vecA = resultA.embedding;
      const vecB = resultB.embedding;
      let hasDifference = false;
      for (let i = 0; i < vecA.length; i++) {
        if (Math.abs((vecA[i] ?? 0) - (vecB[i] ?? 0)) > 1e-6) {
          hasDifference = true;
          break;
        }
      }
      expect(hasDifference).toBe(true);
    }
  }, 30_000);

  it("identical texts produce identical embedding vectors", async () => {
    const text = "opencode memory plugin E2E test";
    const resultA = await backend.embed(text, "document");
    const resultB = await backend.embed(text, "document");

    expect("embedding" in resultA).toBe(true);
    expect("embedding" in resultB).toBe(true);

    if ("embedding" in resultA && "embedding" in resultB) {
      const vecA = resultA.embedding;
      const vecB = resultB.embedding;
      for (let i = 0; i < vecA.length; i++) {
        expect(vecA[i]).toBeCloseTo(vecB[i] ?? 0, 10);
      }
    }
  }, 30_000);

  it("round-trip: add a memory and retrieve it via semantic search", async () => {
    const db = createDatabase(tempDbPath, E2E_DIMENSIONS);
    const vectorBackend = await createVectorBackend(db, E2E_DIMENSIONS);
    const store = createMemoryStore(db, backend, e2eConfig, vectorBackend);

    const uniqueContent = "The Eiffel Tower is located in Paris France E2E round-trip test";
    const added = await store.add(uniqueContent, { tags: "e2e,landmark", type: "fact" });

    expect(added.id).toBeTruthy();
    expect(added.content).toBe(uniqueContent);

    const results = await store.search("Eiffel Tower Paris", 5);
    const found = results.some((r) => r.id === added.id);
    expect(found).toBe(true);

    db.close();
  }, 60_000);
});
