import { createHash } from "crypto";
import { homedir } from "os";
import { join } from "path";
import type { PluginConfig } from "./types.js";

export function getConfig(projectPath: string): PluginConfig {
  return {
    embeddingApiUrl:
      process.env.OPENCODE_MEMORY_EMBEDDING_API_URL ??
      "https://api.openai.com/v1/embeddings",
    embeddingApiKey: process.env.OPENCODE_MEMORY_EMBEDDING_API_KEY ?? "",
    embeddingModel:
      process.env.OPENCODE_MEMORY_EMBEDDING_MODEL ?? "text-embedding-3-small",
    embeddingDimensions: parseInt(
      process.env.OPENCODE_MEMORY_EMBEDDING_DIMENSIONS ?? "1536",
      10
    ),
    storagePath:
      process.env.OPENCODE_MEMORY_STORAGE_PATH ??
      join(homedir(), ".opencode-memory"),
    searchLimit: parseInt(
      process.env.OPENCODE_MEMORY_SEARCH_LIMIT ?? "5",
      10
    ),
    contextLimit: parseInt(
      process.env.OPENCODE_MEMORY_CONTEXT_LIMIT ?? "3",
      10
    ),
  };
}

export function getProjectStoragePath(
  storagePath: string,
  projectPath: string
): string {
  const hash = createHash("sha256")
    .update(projectPath)
    .digest("hex")
    .slice(0, 12);
  return join(storagePath, hash, "memory.db");
}

export function generateMemoryId(): string {
  return `mem_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
}


