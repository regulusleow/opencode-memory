import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test";
import { createEmbeddingService, EmbeddingService } from "../src/services/embedding.js";
import type { PluginConfig } from "../src/types.js";

const defaultConfig: PluginConfig = {
  embeddingApiUrl: "https://api.openai.com/v1/embeddings",
  embeddingApiKey: "sk-test-key",
  embeddingModel: "text-embedding-3-small",
  embeddingDimensions: 1536,
  storagePath: "/tmp/test",
  searchLimit: 10,
  contextLimit: 2000,
};

describe("EmbeddingService", () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("isConfigured() returns false when API key is empty", () => {
    const service = createEmbeddingService({
      ...defaultConfig,
      embeddingApiKey: "",
    });
    expect(service.isConfigured()).toBe(false);
  });

  it("isConfigured() returns true when API key is set", () => {
    const service = createEmbeddingService(defaultConfig);
    expect(service.isConfigured()).toBe(true);
  });

  it("embed() returns { error } when not configured (no fetch call)", async () => {
    const service = createEmbeddingService({
      ...defaultConfig,
      embeddingApiKey: "",
    });

    let fetchCalled = false;
    globalThis.fetch = mock(async () => {
      fetchCalled = true;
      return new Response("{}");
    });

    const result = await service.embed("test text");

    expect(result).toEqual(
      expect.objectContaining({
        error: expect.any(String),
      })
    );
    expect(fetchCalled).toBe(false);
  });

  it("embed() calls correct URL with correct body", async () => {
    const service = createEmbeddingService(defaultConfig);

    let capturedRequest: {
      url: string;
      method: string;
      headers: Record<string, string>;
      body: string;
    } | null = null;

    globalThis.fetch = mock(async (url: string, init?: RequestInit) => {
      capturedRequest = {
        url,
        method: init?.method || "GET",
        headers: (init?.headers as Record<string, string>) || {},
        body: (init?.body as string) || "",
      };

      return new Response(
        JSON.stringify({
          data: [
            {
              embedding: Array(defaultConfig.embeddingDimensions).fill(0.1),
              index: 0,
              object: "embedding",
            },
          ],
          model: defaultConfig.embeddingModel,
          object: "list",
          usage: { prompt_tokens: 1, total_tokens: 1 },
        })
      );
    });

    await service.embed("test text");

    expect(capturedRequest).toBeTruthy();
    expect(capturedRequest!.url).toBe(defaultConfig.embeddingApiUrl);
    expect(capturedRequest!.method).toBe("POST");
    expect(capturedRequest!.headers["Content-Type"]).toBe("application/json");
    expect(capturedRequest!.headers["Authorization"]).toBe(
      `Bearer ${defaultConfig.embeddingApiKey}`
    );

    const bodyObj = JSON.parse(capturedRequest!.body);
    expect(bodyObj.model).toBe(defaultConfig.embeddingModel);
    expect(bodyObj.input).toBe("test text");
    expect(bodyObj.dimensions).toBe(defaultConfig.embeddingDimensions);
  });

  it("embed() parses OpenAI response format correctly", async () => {
    const service = createEmbeddingService(defaultConfig);

    const expectedEmbedding = [0.1, 0.2, 0.3, 0.4, 0.5];
    globalThis.fetch = mock(async () => {
      return new Response(
        JSON.stringify({
          data: [
            {
              embedding: expectedEmbedding,
              index: 0,
              object: "embedding",
            },
          ],
          model: defaultConfig.embeddingModel,
          object: "list",
          usage: { prompt_tokens: 1, total_tokens: 1 },
        })
      );
    });

    const result = await service.embed("test text");

    expect("embedding" in result).toBe(true);
    expect(result.embedding instanceof Float64Array).toBe(true);
    expect(Array.from(result.embedding!)).toEqual(expectedEmbedding);
  });

  it("embed() returns { error } on HTTP 500", async () => {
    const service = createEmbeddingService(defaultConfig);

    globalThis.fetch = mock(async () => {
      return new Response(JSON.stringify({ error: "Server error" }), {
        status: 500,
      });
    });

    const result = await service.embed("test text");

    expect(result).toEqual(
      expect.objectContaining({
        error: expect.any(String),
      })
    );
  });

  it("embed() returns { error } on timeout", async () => {
    const service = createEmbeddingService({
      ...defaultConfig,
      embeddingApiUrl: "https://api.openai.com/v1/embeddings",
    });

    let abortSignalReceived: AbortSignal | null = null;

    globalThis.fetch = mock(async (_url: string, init?: RequestInit) => {
      abortSignalReceived = init?.signal || null;
      // Simulate a timeout by waiting longer than service timeout
      await new Promise((resolve) => setTimeout(resolve, 50));
      return new Response("{}");
    });

    const result = await service.embed("test text");

    // Should have received an abort signal or timeout error
    expect(result).toEqual(
      expect.objectContaining({
        error: expect.any(String),
      })
    );
  });

  it("embedBatch() sends all texts in ONE request", async () => {
    const service = createEmbeddingService(defaultConfig);

    let capturedRequest: {
      url: string;
      method: string;
      body: string;
    } | null = null;

    globalThis.fetch = mock(async (url: string, init?: RequestInit) => {
      capturedRequest = {
        url,
        method: init?.method || "GET",
        body: (init?.body as string) || "",
      };

      return new Response(
        JSON.stringify({
          data: [
            {
              embedding: Array(defaultConfig.embeddingDimensions).fill(0.1),
              index: 0,
              object: "embedding",
            },
            {
              embedding: Array(defaultConfig.embeddingDimensions).fill(0.2),
              index: 1,
              object: "embedding",
            },
          ],
          model: defaultConfig.embeddingModel,
          object: "list",
          usage: { prompt_tokens: 2, total_tokens: 2 },
        })
      );
    });

    const results = await service.embedBatch(["text1", "text2"]);

    expect(capturedRequest).toBeTruthy();
    const bodyObj = JSON.parse(capturedRequest!.body);
    expect(bodyObj.input).toEqual(["text1", "text2"]);
    expect(results.length).toBe(2);
    expect(results[0].embedding instanceof Float64Array).toBe(true);
    expect(results[1].embedding instanceof Float64Array).toBe(true);
  });
});
