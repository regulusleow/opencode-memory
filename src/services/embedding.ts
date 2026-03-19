import type { PluginConfig } from "../types.js";

export interface EmbeddingService {
  embed(text: string): Promise<{ embedding: Float64Array } | { error: string }>;
  embedBatch(
    texts: string[]
  ): Promise<Array<{ embedding: Float64Array } | { error: string }>>;
  isConfigured(): boolean;
}

interface OpenAIEmbeddingResponse {
  data: Array<{
    embedding: number[];
    index: number;
    object: string;
  }>;
  model: string;
  object: string;
  usage: {
    prompt_tokens: number;
    total_tokens: number;
  };
}

const TIMEOUT_MS = 10000;

export function createEmbeddingService(config: PluginConfig): EmbeddingService {
  return {
    isConfigured(): boolean {
      return config.embeddingApiKey !== "";
    },

    async embed(text: string) {
      if (!this.isConfigured()) {
        return { error: "Embedding API not configured" };
      }

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

        const response = await fetch(config.embeddingApiUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${config.embeddingApiKey}`,
          },
          body: JSON.stringify({
            model: config.embeddingModel,
            input: text,
            dimensions: config.embeddingDimensions,
          }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          return { error: `HTTP ${response.status}` };
        }

        const data = (await response.json()) as OpenAIEmbeddingResponse;

        if (!data.data?.[0]?.embedding) {
          return { error: "Invalid response format" };
        }

        const embedding = new Float64Array(data.data[0].embedding);
        return { embedding };
      } catch (err) {
        const errorMsg =
          err instanceof Error ? err.message : "Unknown error";
        return { error: errorMsg };
      }
    },

    async embedBatch(texts: string[]) {
      if (!this.isConfigured()) {
        return texts.map(() => ({ error: "Embedding API not configured" }));
      }

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

        const response = await fetch(config.embeddingApiUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${config.embeddingApiKey}`,
          },
          body: JSON.stringify({
            model: config.embeddingModel,
            input: texts,
            dimensions: config.embeddingDimensions,
          }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          return texts.map(() => ({ error: `HTTP ${response.status}` }));
        }

        const data = (await response.json()) as OpenAIEmbeddingResponse;

        if (!data.data) {
          return texts.map(() => ({ error: "Invalid response format" }));
        }

        return data.data.map((item) => {
          if (!item.embedding) {
            return { error: "Missing embedding in response" };
          }
          return { embedding: new Float64Array(item.embedding) };
        });
      } catch (err) {
        const errorMsg =
          err instanceof Error ? err.message : "Unknown error";
        return texts.map(() => ({ error: errorMsg }));
      }
    },
  };
}
