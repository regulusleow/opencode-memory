import type { Plugin, PluginInput } from "@opencode-ai/plugin";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { getConfig, getProjectStoragePath } from "./config.js";
import { createDatabase } from "./services/database.js";
import { createEmbeddingService } from "./services/embedding.js";
import { createMemoryStore } from "./services/memory-store.js";
import { createMemoryTool } from "./services/tool.js";
import { createChatMessageHook } from "./services/hooks.js";

export const plugin: Plugin = async (ctx: PluginInput) => {
  const { directory } = ctx;

  try {
    const config = getConfig(directory);
    const dbPath = getProjectStoragePath(config.storagePath, directory);

    mkdirSync(dirname(dbPath), { recursive: true });

    const db = createDatabase(dbPath, config.embeddingDimensions);
    const embeddingService = createEmbeddingService(config);
    const store = createMemoryStore(db, embeddingService, config);
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
