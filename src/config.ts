// @ts-ignore - Bun runtime global
import { createHash } from "crypto";
// @ts-ignore - Bun runtime global
import { homedir } from "os";
// @ts-ignore - Bun runtime global
import { join } from "path";
import type { PluginConfig } from "./types.js";

export function getConfig(projectPath: string): PluginConfig {
  return {
    embeddingApiUrl:
      // @ts-ignore
      process.env.OPENCODE_MEMORY_EMBEDDING_API_URL ??
      "https://api.openai.com/v1/embeddings",
    embeddingApiKey:
      // @ts-ignore
      process.env.OPENCODE_MEMORY_EMBEDDING_API_KEY ?? "",
    embeddingModel:
      // @ts-ignore
      process.env.OPENCODE_MEMORY_EMBEDDING_MODEL ?? "text-embedding-3-small",
    embeddingDimensions: parseInt(
      // @ts-ignore
      process.env.OPENCODE_MEMORY_EMBEDDING_DIMENSIONS ?? "1536",
      10
    ),
    storagePath:
      // @ts-ignore
      process.env.OPENCODE_MEMORY_STORAGE_PATH ??
      join(homedir(), ".opencode-memory"),
    searchLimit: parseInt(
      // @ts-ignore
      process.env.OPENCODE_MEMORY_SEARCH_LIMIT ?? "5",
      10
    ),
    contextLimit: parseInt(
      // @ts-ignore
      process.env.OPENCODE_MEMORY_CONTEXT_LIMIT ?? "3",
      10
    ),
  };
}

export function getProjectStoragePath(
  storagePath: string,
  projectPath: string
): string {
  // @ts-ignore
  const hash = createHash("sha256")
    .update(projectPath)
    .digest("hex")
    .slice(0, 12);
  return join(storagePath, hash, "memory.db");
}

export function generateMemoryId(): string {
  // @ts-ignore
  return `mem_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
}

