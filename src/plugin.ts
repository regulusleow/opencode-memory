import type { Plugin, PluginInput } from "@opencode-ai/plugin";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { getConfig, getEmbeddingDimensions, getProjectStoragePath } from "./config.js";
import { createDatabase, getEmbeddingMeta, setEmbeddingMeta } from "./services/database.js";
import { createApiEmbeddingBackend } from "./services/embedding.js";
import { createLocalEmbeddingBackend } from "./services/local-embedding.js";
import { detectDimensionMismatch, freshStartMigration } from "./services/migration.js";
import { runMigrations } from "./services/migration-runner.js";
import { memoryMigrations } from "./services/migrations.js";
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
import { createAiService, type PromptClient } from "./services/ai-service.js";
import { createWebServer } from "./services/web-server.js";
import { getIndexHtml } from "./services/web-ui.js";
import { createEventBus } from "./services/event-bus.js";
import { createSessionSummary } from "./services/session-summary.js";

export const plugin: Plugin = async (ctx: PluginInput) => {
  const { directory } = ctx;
  let logger = createLogger();

  try {
    const config = getConfig(directory);
    logger = createLogger({ storagePath: config.storagePath, logLevel: config.logLevel });
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

    runMigrations(db, memoryMigrations, logger);

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
    const eventBus = createEventBus();
    const store = createMemoryStore(db, embeddingService, config, vectorBackend, privacyFilter, dedupService, logger, eventBus);

    const profileStore = createProfileStore(db);
    const aiService = createAiService({ client: ctx.client as unknown as PromptClient, config, logger });
    const profileExtractor = createProfileExtractor({ client: ctx.client as unknown as ProfileClient, aiService, profileStore, config, logger });
    const webServer = createWebServer({ store, profileStore, config, logger, getHtml: () => getIndexHtml(config.webServerPort), eventBus });
    await webServer.start();
    const sessionSummary = createSessionSummary({ aiService, store, config, logger });

    const onWebStart = async (): Promise<string> => {
      const result = await webServer.start();
      return result.url;
    };

    const memoryTool = createMemoryTool(store, config, { profileStore, profileExtractor, onWebStart });
    const chatHook = createChatMessageHook(store, config, profileStore);
     const autoCapture = createAutoCapture({ client: ctx.client as any, store, config, logger, aiService });
    const onIdleSummary = async (sessionID: string) => {
      const raw: Array<{ info: any; parts: any[] }> = ((await (ctx.client as any).session.messages({ path: { id: sessionID } })) as any).data ?? [];
      const messages = raw.map((m) => ({
        role: m.info?.role ?? "unknown",
        content: (m.parts ?? [])
          .filter((p: any) => p.type === "text" && typeof p.text === "string")
          .map((p: any) => p.text as string)
          .join(" "),
      })).filter((m) => m.content.trim().length > 0);
      const summary = await sessionSummary.generateSummary(sessionID, messages);
      if (summary) {
        await sessionSummary.storeSummary(sessionID, summary);
      }
    };
    const eventHandler = createEventHandler({ needsReinjection, onIdle: autoCapture, onIdleProfile: profileExtractor.extract, onIdleSummary, config, logger });

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
