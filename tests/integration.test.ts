import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getConfig, getProjectStoragePath } from "../src/config.js";
import { plugin } from "../src/plugin.js";
import { createDatabase, closeDatabase } from "../src/services/database.js";
import { createEmbeddingService } from "../src/services/embedding.js";
import { createMemoryStore } from "../src/services/memory-store.js";
import { createVectorBackend } from "../src/services/vector-backend.js";
import { createMemoryTool } from "../src/services/tool.js";
import type { PluginConfig } from "../src/types.js";

const tempDirs: string[] = [];

function makeTempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

function makePluginInput(directory: string): any {
  return {
    directory,
    client: {},
  };
}

describe("plugin integration", () => {
  beforeEach(() => {});

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("plugin() returns chat.message hook and tool.memory", async () => {
    const projectDir = makeTempDir("opencode-memory-int-project-");

    const hooks = await plugin(makePluginInput(projectDir));

    expect(typeof hooks["chat.message"]).toBe("function");
    expect(hooks.tool).toBeDefined();
    expect(hooks.tool?.memory).toBeDefined();
    expect(typeof hooks.tool?.memory.execute).toBe("function");
  });

  it("plugin() initializes successfully with temp directory and creates db file", async () => {
    const projectDir = makeTempDir("opencode-memory-int-project-");

    const hooks = await plugin(makePluginInput(projectDir));
    const dbPath = getProjectStoragePath(getConfig(projectDir).storagePath, projectDir);

    expect(hooks).toBeDefined();
    expect(existsSync(dbPath)).toBe(true);
  });

  it("assembled components support add -> search -> list -> forget lifecycle", async () => {
      const config: PluginConfig = {
        embeddingApiUrl: "https://api.openai.com/v1/embeddings",
        embeddingApiKey: "",
        embeddingModel: "text-embedding-3-small",
        embeddingDimensions: 4,
        storagePath: "/tmp/opencode-memory-test",
        searchLimit: 5,
        contextLimit: 3,
        embeddingBackend: "auto",
        localModel: "nomic-ai/nomic-embed-text-v1.5",
        localDtype: "q8",
        localCacheDir: "/tmp/opencode-memory-test/models",
      };

    const db = createDatabase(":memory:", config.embeddingDimensions);

    try {
      const embeddingService = createEmbeddingService(config);
      const vectorBackend = await createVectorBackend(db, config.embeddingDimensions);
      const store = createMemoryStore(db, embeddingService, config, vectorBackend);
      const memoryTool = createMemoryTool(store, config);

      const addResult = await memoryTool.execute(
        {
          mode: "add",
          content: "Objective-C 项目的广告缓存策略",
          tags: "ios,objc,ads",
        },
        { sessionID: "ses_integration", messageID: "msg_1", agent: "test", directory: "/tmp", worktree: "/tmp", abort: new AbortController().signal, metadata: () => {}, ask: async () => {} }
      );

      expect(addResult).toContain("Memory stored with ID:");
      const idMatch = addResult.match(/Memory stored with ID: (mem_[^\s]+)/);
      expect(idMatch).toBeTruthy();
      const memoryId = idMatch?.[1] as string;

      const searchResult = await memoryTool.execute(
        { mode: "search", query: "广告缓存" },
        { sessionID: "ses_integration", messageID: "msg_2", agent: "test", directory: "/tmp", worktree: "/tmp", abort: new AbortController().signal, metadata: () => {}, ask: async () => {} }
      );
      expect(searchResult).toContain("Objective-C 项目的广告缓存策略");

      const listResult = await memoryTool.execute(
        { mode: "list" },
        { sessionID: "ses_integration", messageID: "msg_3", agent: "test", directory: "/tmp", worktree: "/tmp", abort: new AbortController().signal, metadata: () => {}, ask: async () => {} }
      );
      expect(listResult).toContain(memoryId);

      const forgetResult = await memoryTool.execute(
        { mode: "forget", memoryId },
        { sessionID: "ses_integration", messageID: "msg_4", agent: "test", directory: "/tmp", worktree: "/tmp", abort: new AbortController().signal, metadata: () => {}, ask: async () => {} }
      );
      expect(forgetResult.toLowerCase()).toMatch(/delet|remov|success/);

      const searchAfterForget = await memoryTool.execute(
        { mode: "search", query: "广告缓存" },
        { sessionID: "ses_integration", messageID: "msg_5", agent: "test", directory: "/tmp", worktree: "/tmp", abort: new AbortController().signal, metadata: () => {}, ask: async () => {} }
      );
      expect(searchAfterForget).toContain("No memories found.");
    } finally {
      closeDatabase(db);
    }
  });

  it("chat.message hook is a function", async () => {
    const projectDir = makeTempDir("opencode-memory-int-project-");

    const hooks = await plugin(makePluginInput(projectDir));
    expect(typeof hooks["chat.message"]).toBe("function");
  });

  it("plugin() handles initialization error gracefully", async () => {
    const projectDir = undefined as unknown as string;

    const hooks = await plugin(makePluginInput(projectDir));

    expect(hooks).toEqual({});
  });
});
