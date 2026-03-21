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
import { createChatMessageHook, needsReinjection } from "./services/hooks.js";
import { createLogger } from "./services/logger.js";
import { createPrivacyFilter } from "./services/privacy.js";
import { createDedupService } from "./services/dedup.js";
import { createEventHandler } from "./services/event-handler.js";
import { createAutoCapture } from "./services/auto-capture.js";

export const plugin: Plugin = async (ctx: PluginInput) => {
  const { directory } = ctx;
  const logger = createLogger(ctx.client);

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
        logger.warn("Dimension mismatch detected, running fresh-start migration...");
        freshStartMigration(db, resolvedModel, resolvedDimensions);
      }
    }

    if (embeddingService.warmup) {
      embeddingService.warmup().catch((err) => {
        logger.warn("Local model warmup failed", { error: String(err) });
      });
    }

    const vectorBackend = await createVectorBackend(db, resolvedDimensions);
    const privacyFilter = createPrivacyFilter(config.privacyPatterns);
    const dedupService = createDedupService(db, vectorBackend, { dedupSimilarityThreshold: config.dedupSimilarityThreshold });
    const store = createMemoryStore(db, embeddingService, config, vectorBackend, privacyFilter, dedupService, logger);
    const memoryTool = createMemoryTool(store, config);
    const chatHook = createChatMessageHook(store, config);
    const autoCapture = createAutoCapture({ client: ctx.client as any, store, config, logger });
    const eventHandler = createEventHandler({ needsReinjection, onIdle: autoCapture, config, logger });

    return {
      "chat.message": chatHook,
      event: eventHandler as any,
      tool: {
        memory: memoryTool,
      },
    };
  } catch (error) {
    logger.error("Plugin initialization failed", { error: String(error) });
    return {};
  }
};
