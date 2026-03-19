import type { PluginConfig } from "../types.js";
import type { EmbeddingService } from "./embedding.js";

const WARMUP_TIMEOUT_MS = 120_000;

type EmbeddingPurpose = "document" | "query";

type PipelineOutput = {
  data: ArrayLike<number>;
};

type PipelineFn = (
  text: string,
  options: { pooling: "mean"; normalize: true }
) => Promise<PipelineOutput>;

type TransformersModule = {
  pipeline: (
    task: "feature-extraction",
    model: string,
    options: { dtype: string }
  ) => Promise<PipelineFn>;
  env: {
    cacheDir: string;
    allowLocalModels: boolean;
    allowRemoteModels: boolean;
  };
};

type TransformersImporter = () => Promise<TransformersModule>;

export function createLocalEmbeddingBackend(
  config: PluginConfig,
  importFn: TransformersImporter =
    () =>
      (new Function(
        "return import('@huggingface/transformers')"
      )() as Promise<TransformersModule>)
): EmbeddingService {
  let pipelineFn: PipelineFn | null = null;
  let initPromise: Promise<void> | null = null;

  async function warmup(): Promise<void> {
    if (!initPromise) {
      initPromise = (async () => {
        const { pipeline, env } = await importFn();
        env.cacheDir = config.localCacheDir;
        env.allowLocalModels = true;
        env.allowRemoteModels = true;
        pipelineFn = await pipeline("feature-extraction", config.localModel, {
          dtype: config.localDtype,
        });
      })().catch((error) => {
        initPromise = null;
        pipelineFn = null;
        throw error;
      });
    }

    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error("Local model warmup timed out"));
      }, WARMUP_TIMEOUT_MS);
    });

    try {
      await Promise.race([initPromise, timeoutPromise]);
    } finally {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
    }
  }

  function buildInput(text: string, purpose?: EmbeddingPurpose): string {
    const prefix = purpose === "query" ? "search_query: " : "search_document: ";
    return `${prefix}${text}`;
  }

  return {
    async embed(text: string, purpose?: EmbeddingPurpose) {
      if (text === "") {
        return { error: "Empty text" };
      }

      try {
        if (!pipelineFn) {
          await warmup();
        }

        if (!pipelineFn) {
          return { error: "Local embedding pipeline not initialized" };
        }

        const input = buildInput(text, purpose);
        const output = await pipelineFn(input, {
          pooling: "mean",
          normalize: true,
        });
        return { embedding: new Float64Array(output.data) };
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : "Unknown error";
        return { error: errorMsg };
      }
    },

    async embedBatch(texts: string[], purpose?: EmbeddingPurpose) {
      const results: Array<{ embedding: Float64Array } | { error: string }> = [];
      for (const text of texts) {
        results.push(await this.embed(text, purpose));
      }
      return results;
    },

    isConfigured() {
      return true;
    },

    warmup,
  };
}
