import { beforeEach, describe, expect, it, mock } from "bun:test";
import { createLocalEmbeddingBackend } from "../src/services/local-embedding.js";
import type { PluginConfig } from "../src/types.js";

const baseConfig: PluginConfig = {
  embeddingApiUrl: "https://api.openai.com/v1/embeddings",
  embeddingApiKey: "",
  embeddingModel: "text-embedding-3-small",
  embeddingDimensions: 1536,
  storagePath: "/tmp/test",
  searchLimit: 10,
  contextLimit: 3,
  embeddingBackend: "local",
  localModel: "nomic-ai/nomic-embed-text-v1.5",
  localDtype: "q8",
  localCacheDir: "/tmp/local-model-cache",
};

describe("createLocalEmbeddingBackend", () => {
  let pipelineFnMock: ReturnType<typeof mock>;
  let pipelineFactoryMock: ReturnType<typeof mock>;

  beforeEach(() => {
    pipelineFnMock = mock(async (_text: string, _opts: object) => ({
      data: new Float32Array([0.1, 0.2, 0.3]),
    }));

    pipelineFactoryMock = mock(
      async (_task: string, _model: string, _opts: object) => pipelineFnMock
    );

    mock.module("@huggingface/transformers", () => ({
      pipeline: pipelineFactoryMock,
      env: {
        cacheDir: "",
        allowLocalModels: false,
        allowRemoteModels: false,
      },
    }));
  });

  it("embed(document) uses search_document prefix and returns Float64Array", async () => {
    const backend = createLocalEmbeddingBackend(baseConfig);
    const result = await backend.embed("hello world", "document");

    expect(pipelineFnMock).toHaveBeenCalledWith("search_document: hello world", {
      pooling: "mean",
      normalize: true,
    });

    expect("embedding" in result).toBe(true);
    if ("embedding" in result) {
      expect(result.embedding).toBeInstanceOf(Float64Array);
      expect(result.embedding[0]).toBeCloseTo(0.1, 5);
      expect(result.embedding[1]).toBeCloseTo(0.2, 5);
      expect(result.embedding[2]).toBeCloseTo(0.3, 5);
    }
  });

  it("embed(query) uses search_query prefix", async () => {
    const backend = createLocalEmbeddingBackend(baseConfig);

    await backend.embed("hello world", "query");

    expect(pipelineFnMock).toHaveBeenCalledWith("search_query: hello world", {
      pooling: "mean",
      normalize: true,
    });
  });

  it("embed(undefined purpose) defaults to search_document prefix", async () => {
    const backend = createLocalEmbeddingBackend(baseConfig);

    await backend.embed("hello");

    expect(pipelineFnMock).toHaveBeenCalledWith("search_document: hello", {
      pooling: "mean",
      normalize: true,
    });
  });

  it("embed(empty text) returns Empty text error without pipeline call", async () => {
    const backend = createLocalEmbeddingBackend(baseConfig);

    const result = await backend.embed("");

    expect(result).toEqual({ error: "Empty text" });
    expect(pipelineFactoryMock).not.toHaveBeenCalled();
    expect(pipelineFnMock).not.toHaveBeenCalled();
  });

  it("embed(empty text query) returns Empty text error", async () => {
    const backend = createLocalEmbeddingBackend(baseConfig);

    const result = await backend.embed("", "query");

    expect(result).toEqual({ error: "Empty text" });
    expect(pipelineFactoryMock).not.toHaveBeenCalled();
    expect(pipelineFnMock).not.toHaveBeenCalled();
  });

  it("converts Float32Array output to Float64Array with matching values", async () => {
    pipelineFnMock = mock(async (_text: string, _opts: object) => ({
      data: new Float32Array([1.5, 2.5, 3.5]),
    }));

    pipelineFactoryMock = mock(
      async (_task: string, _model: string, _opts: object) => pipelineFnMock
    );

    const mockImportFn = async () => ({
      pipeline: pipelineFactoryMock,
      env: {
        cacheDir: "",
        allowLocalModels: false,
        allowRemoteModels: false,
      },
    });

    const backend = createLocalEmbeddingBackend(baseConfig, mockImportFn);
    const result = await backend.embed("hello");

    expect("embedding" in result).toBe(true);
    if ("embedding" in result) {
      expect(result.embedding).toBeInstanceOf(Float64Array);
      expect(result.embedding[0]).toBeCloseTo(1.5, 5);
      expect(result.embedding[1]).toBeCloseTo(2.5, 5);
      expect(result.embedding[2]).toBeCloseTo(3.5, 5);
    }
  });

  it("isConfigured always returns true", () => {
    const backend = createLocalEmbeddingBackend(baseConfig);
    expect(backend.isConfigured()).toBe(true);
  });

  it("warmup is singleton and initializes pipeline once", async () => {
    const backend = createLocalEmbeddingBackend(baseConfig);

    await backend.warmup?.();
    await backend.warmup?.();

    expect(pipelineFactoryMock).toHaveBeenCalledTimes(1);
  });

  it("concurrent embed calls share the same warmup promise", async () => {
    const backend = createLocalEmbeddingBackend(baseConfig);

    await Promise.all([backend.embed("a"), backend.embed("b")]);

    expect(pipelineFactoryMock).toHaveBeenCalledTimes(1);
  });

  it("embedBatch processes all texts with document prefix", async () => {
    const backend = createLocalEmbeddingBackend(baseConfig);

    const results = await backend.embedBatch(["a", "b"], "document");

    expect(results).toHaveLength(2);
    expect(pipelineFnMock).toHaveBeenNthCalledWith(1, "search_document: a", {
      pooling: "mean",
      normalize: true,
    });
    expect(pipelineFnMock).toHaveBeenNthCalledWith(2, "search_document: b", {
      pooling: "mean",
      normalize: true,
    });
    expect(results.every((item) => "embedding" in item)).toBe(true);
  });
});
