import { createHash } from "crypto";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "os";
import { join } from "path";
import type { PluginConfig } from "./types.js";

const CONFIG_PATH = [".config", "opencode", "opencode-memory.jsonc"];

interface RawPluginConfig {
  embeddingApiUrl?: unknown;
  embeddingApiKey?: unknown;
  embeddingModel?: unknown;
  embeddingDimensions?: unknown;
  storagePath?: unknown;
  searchLimit?: unknown;
  contextLimit?: unknown;
  embeddingBackend?: unknown;
  localModel?: unknown;
  localDtype?: unknown;
  localCacheDir?: unknown;
}

function getConfigFilePath(): string {
  return join(homedir(), ...CONFIG_PATH);
}

export function stripJsonComments(src: string): string {
  let out = "";
  let inString = false;
  const stringQuote = '"';
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    const next = src[i + 1];

    if (inLineComment) {
      if (ch === "\n") {
        inLineComment = false;
        out += ch;
      }
      continue;
    }

    if (inBlockComment) {
      if (ch === "*" && next === "/") {
        inBlockComment = false;
        i += 1;
      }
      continue;
    }

    if (inString) {
      out += ch;
      if (ch === "\\") {
        out += next ?? "";
        i += 1;
        continue;
      }

      if (ch === stringQuote) {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      out += ch;
      continue;
    }

    if (ch === "/" && next === "/") {
      inLineComment = true;
      i += 1;
      continue;
    }

    if (ch === "/" && next === "*") {
      inBlockComment = true;
      i += 1;
      continue;
    }

    out += ch;
  }

  return out;
}

export function expandPath(p: string): string {
  if (p === "~") {
    return homedir();
  }

  if (p.startsWith("~/")) {
    return join(homedir(), p.slice(2));
  }

  return p;
}

export function getEmbeddingDimensions(model: string): number {
  const dimensionMap: Record<string, number> = {
    "nomic-ai/nomic-embed-text-v1.5": 768,
    "text-embedding-3-small": 1536,
    "text-embedding-3-large": 3072,
    "text-embedding-ada-002": 1536,
  };

  return dimensionMap[model] ?? 768;
}

function parseConfigFile(): RawPluginConfig {
  const configPath = getConfigFilePath();
  if (!existsSync(configPath)) {
    return {};
  }

  try {
    const content = readFileSync(configPath, "utf-8");
    return JSON.parse(stripJsonComments(content)) as RawPluginConfig;
  } catch {
    return {};
  }
}

function getDefaultConfig(): PluginConfig {
  const storagePath = expandPath("~/.opencode-memory");

  return {
    embeddingApiUrl: "https://api.openai.com/v1/embeddings",
    embeddingApiKey: "",
    embeddingModel: "text-embedding-3-small",
    embeddingDimensions: 1536,
    storagePath,
    searchLimit: 5,
    contextLimit: 3,
    embeddingBackend: "auto",
    localModel: "nomic-ai/nomic-embed-text-v1.5",
    localDtype: "q8",
    localCacheDir: join(storagePath, "models"),
  };
}

export function getConfig(projectPath: string): PluginConfig {
  void projectPath;

  const defaults = getDefaultConfig();
  const raw = parseConfigFile();

  const storagePath =
    typeof raw.storagePath === "string"
      ? expandPath(raw.storagePath)
      : defaults.storagePath;

  const embeddingModel =
    typeof raw.embeddingModel === "string"
      ? raw.embeddingModel
      : defaults.embeddingModel;

  const embeddingDimensions =
    typeof raw.embeddingDimensions === "number"
      ? raw.embeddingDimensions
      : getEmbeddingDimensions(embeddingModel);

  const embeddingBackend =
    raw.embeddingBackend === "auto" ||
    raw.embeddingBackend === "api" ||
    raw.embeddingBackend === "local"
      ? raw.embeddingBackend
      : defaults.embeddingBackend;

  return {
    embeddingApiUrl:
      typeof raw.embeddingApiUrl === "string"
        ? raw.embeddingApiUrl
        : defaults.embeddingApiUrl,
    embeddingApiKey:
      typeof raw.embeddingApiKey === "string"
        ? raw.embeddingApiKey
        : defaults.embeddingApiKey,
    embeddingModel,
    embeddingDimensions,
    storagePath,
    searchLimit:
      typeof raw.searchLimit === "number" ? raw.searchLimit : defaults.searchLimit,
    contextLimit:
      typeof raw.contextLimit === "number" ? raw.contextLimit : defaults.contextLimit,
    embeddingBackend,
    localModel:
      typeof raw.localModel === "string" ? raw.localModel : defaults.localModel,
    localDtype:
      typeof raw.localDtype === "string" ? raw.localDtype : defaults.localDtype,
    localCacheDir:
      typeof raw.localCacheDir === "string"
        ? expandPath(raw.localCacheDir)
        : join(storagePath, "models"),
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
