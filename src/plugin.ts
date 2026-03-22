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
import { createProfileStore } from "./services/profile-store.js";
import { createProfileExtractor, type ProfileClient } from "./services/profile-extractor.js";
import { createAiService } from "./services/ai-service.js";
import { createWebServer } from "./services/web-server.js";
import { getIndexHtml } from "./services/web-ui.js";

export const plugin: Plugin = async (ctx: PluginInput) => {
  const { directory } = ctx;
  let logger = createLogger(ctx.client);

  try {
    const config = getConfig(directory);
    logger = createLogger(ctx.client, { logLevel: config.logLevel });
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

    const profileStore = createProfileStore(db);
    const aiService = createAiService({ client: ctx.client as any, config, logger });
    const profileExtractor = createProfileExtractor({ client: ctx.client as unknown as ProfileClient, aiService, profileStore, config, logger });
    const webServer = createWebServer({ store, profileStore, config, logger, getHtml: () => getIndexHtml(config.webServerPort) });

    const onWebStart = (): string => {
      if (webServer.isRunning()) {
        return `http://127.0.0.1:${config.webServerPort}`;
      }
      const result = webServer.start();
      return result.url;
    };

    const memoryTool = createMemoryTool(store, config, { profileStore, profileExtractor, onWebStart });
    const chatHook = createChatMessageHook(store, config, profileStore);
    const autoCapture = createAutoCapture({ client: ctx.client as any, store, config, logger });
    const eventHandler = createEventHandler({ needsReinjection, onIdle: autoCapture, onIdleProfile: profileExtractor.extract, config, logger });

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
