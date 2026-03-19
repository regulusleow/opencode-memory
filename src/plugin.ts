import type { Plugin, PluginInput } from "@opencode-ai/plugin";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { getConfig, getEmbeddingDimensions, getProjectStoragePath } from "./config.js";
import { createDatabase, getEmbeddingMeta, setEmbeddingMeta } from "./services/database.js";
import { createApiEmbeddingBackend } from "./services/embedding.js";
import { createLocalEmbeddingBackend } from "./services/local-embedding.js";
import { detectDimensionMismatch, freshStartMigration } from "./services/migration.js";
import { createMemoryStore } from "./services/memory-store.js";
import { createVectorBackend } from "./services/vector-backend.js";
import { createMemoryTool } from "./services/tool.js";
import { createChatMessageHook } from "./services/hooks.js";

export const plugin: Plugin = async (ctx: PluginInput) => {
  const { directory } = ctx;

  try {
    const config = getConfig(directory);
    const dbPath = getProjectStoragePath(config.storagePath, directory);

    mkdirSync(dirname(dbPath), { recursive: true });

    const useApi =
      config.embeddingBackend === "api" ||
      (config.embeddingBackend === "auto" && config.embeddingApiKey !== "");

    const embeddingService = useApi
      ? createApiEmbeddingBackend(config)
      : createLocalEmbeddingBackend(config);
    const resolvedModel = useApi ? config.embeddingModel : config.localModel;
    const resolvedDimensions = useApi
      ? config.embeddingDimensions
      : getEmbeddingDimensions(config.localModel);

    const db = createDatabase(dbPath, resolvedDimensions);

    const meta = getEmbeddingMeta(db);
    if (meta.modelName === null) {
      setEmbeddingMeta(db, resolvedModel, resolvedDimensions);
    } else {
      const { needsMigration } = detectDimensionMismatch(db, resolvedModel, resolvedDimensions);
      if (needsMigration) {
        console.warn(
          "[opencode-memory] Dimension mismatch detected, running fresh-start migration..."
        );
        freshStartMigration(db, resolvedModel, resolvedDimensions);
      }
    }

    if (embeddingService.warmup) {
      embeddingService.warmup().catch((err) => {
        console.warn("[opencode-memory] Local model warmup failed:", err);
      });
    }

    const vectorBackend = await createVectorBackend(db, resolvedDimensions);
    const store = createMemoryStore(db, embeddingService, config, vectorBackend);
    const memoryTool = createMemoryTool(store, config);
    const chatHook = createChatMessageHook(store, config);

    return {
      "chat.message": chatHook,
      tool: {
        memory: memoryTool,
      },
    };
  } catch (error) {
    console.warn("[opencode-memory] Plugin initialization failed:", error);
    return {};
  }
};
