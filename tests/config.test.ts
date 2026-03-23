import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  expandPath,
  generateMemoryId,
  getConfig,
  getEmbeddingDimensions,
  getProjectStoragePath,
  stripJsonComments,
} from "../src/config";
import { makeConfig } from "./helpers";

describe("config module", () => {
  const configPath = join(homedir(), ".config", "opencode", "opencode-memory.jsonc");
  let originalConfig: string | null = null;

  function writeConfigFile(content: string): void {
    mkdirSync(join(homedir(), ".config", "opencode"), { recursive: true });
    writeFileSync(configPath, content, "utf-8");
  }

  beforeEach(() => {
    originalConfig = existsSync(configPath) ? readFileSync(configPath, "utf-8") : null;
  });

  afterEach(() => {
    if (originalConfig === null) {
      if (existsSync(configPath)) {
        unlinkSync(configPath);
      }
    } else {
      mkdirSync(join(homedir(), ".config", "opencode"), { recursive: true });
      writeFileSync(configPath, originalConfig, "utf-8");
    }
  });

  describe("stripJsonComments", () => {
    it("removes line and block comments while preserving strings", () => {
      const src = `{
  // line comment
  "url": "https://api.openai.com/v1/embeddings", /* block comment */
  "name": "model"
}`;

      const stripped = stripJsonComments(src);
      const parsed = JSON.parse(stripped) as Record<string, string>;

      expect(parsed.url).toBe("https://api.openai.com/v1/embeddings");
      expect(parsed.name).toBe("model");
      expect(stripped.includes("// line comment")).toBe(false);
      expect(stripped.includes("/* block comment */")).toBe(false);
    });
  });

  describe("expandPath", () => {
    it("expands a leading ~ to current homedir", () => {
      expect(expandPath("~")).toBe(homedir());
      expect(expandPath("~/.opencode-memory")).toBe(
        join(homedir(), ".opencode-memory")
      );
    });

    it("returns unchanged path if not prefixed with ~", () => {
      expect(expandPath("/tmp/custom")).toBe("/tmp/custom");
    });
  });

  describe("getEmbeddingDimensions", () => {
    it("maps known models and falls back to 768 for unknown", () => {
      expect(getEmbeddingDimensions("nomic-ai/nomic-embed-text-v1.5")).toBe(768);
      expect(getEmbeddingDimensions("text-embedding-3-small")).toBe(1536);
      expect(getEmbeddingDimensions("text-embedding-3-large")).toBe(3072);
      expect(getEmbeddingDimensions("text-embedding-ada-002")).toBe(1536);
      expect(getEmbeddingDimensions("unknown-model")).toBe(768);
    });

    it("maps Xenova/all-MiniLM-L6-v2 to 384", () => {
      expect(getEmbeddingDimensions("Xenova/all-MiniLM-L6-v2")).toBe(384);
    });

    it("maps sentence-transformers/all-MiniLM-L6-v2 to 384", () => {
      expect(getEmbeddingDimensions("sentence-transformers/all-MiniLM-L6-v2")).toBe(384);
    });

    it("maps BAAI/bge-small-en-v1.5 to 384", () => {
      expect(getEmbeddingDimensions("BAAI/bge-small-en-v1.5")).toBe(384);
    });

    it("maps Xenova/bge-small-en-v1.5 to 384", () => {
      expect(getEmbeddingDimensions("Xenova/bge-small-en-v1.5")).toBe(384);
    });

    it("maps BAAI/bge-base-en-v1.5 to 768", () => {
      expect(getEmbeddingDimensions("BAAI/bge-base-en-v1.5")).toBe(768);
    });

    it("maps BAAI/bge-large-en-v1.5 to 1024", () => {
      expect(getEmbeddingDimensions("BAAI/bge-large-en-v1.5")).toBe(1024);
    });

    it("maps nomic-ai/nomic-embed-text-v1 to 768", () => {
      expect(getEmbeddingDimensions("nomic-ai/nomic-embed-text-v1")).toBe(768);
    });

    it("maps Xenova/all-MiniLM-L12-v2 to 384", () => {
      expect(getEmbeddingDimensions("Xenova/all-MiniLM-L12-v2")).toBe(384);
    });

    it("still falls back to 768 for unknown models", () => {
      expect(getEmbeddingDimensions("unknown-model-xyz")).toBe(768);
    });
  });

  describe("getConfig", () => {
    it("returns defaults when config file is missing", () => {
      const config = getConfig("/test/project");

      expect(config.embeddingApiUrl).toBe("https://api.openai.com/v1/embeddings");
      expect(config.embeddingApiKey).toBe("");
      expect(config.embeddingModel).toBe("text-embedding-3-small");
      expect(config.embeddingDimensions).toBe(1536);
      expect(config.storagePath).toBe(join(homedir(), ".opencode-memory"));
      expect(config.searchLimit).toBe(5);
      expect(config.contextLimit).toBe(3);
      expect(config.embeddingBackend).toBe("auto");
      expect(config.localModel).toBe("nomic-ai/nomic-embed-text-v1.5");
      expect(config.localDtype).toBe("q8");
      expect(config.localCacheDir).toBe(
        join(homedir(), ".opencode-memory", "models")
      );
    });

    it("reads jsonc file and merges with defaults", () => {
      writeConfigFile(`{
  // custom settings
  "embeddingApiUrl": "https://custom.example.com/embeddings",
  "embeddingApiKey": "test-key",
  "embeddingModel": "text-embedding-3-large",
  "storagePath": "~/.mem-store",
  "searchLimit": 9,
  "embeddingBackend": "local",
  "localModel": "nomic-ai/nomic-embed-text-v1.5",
  "localDtype": "q8",
  "localCacheDir": "~/.mem-store/custom-models"
}`);

      const config = getConfig("/test/project");

      expect(config.embeddingApiUrl).toBe("https://custom.example.com/embeddings");
      expect(config.embeddingApiKey).toBe("test-key");
      expect(config.embeddingModel).toBe("text-embedding-3-large");
      expect(config.embeddingDimensions).toBe(3072);
      expect(config.storagePath).toBe(join(homedir(), ".mem-store"));
      expect(config.searchLimit).toBe(9);
      expect(config.contextLimit).toBe(3);
      expect(config.embeddingBackend).toBe("local");
      expect(config.localModel).toBe("nomic-ai/nomic-embed-text-v1.5");
      expect(config.localDtype).toBe("q8");
      expect(config.localCacheDir).toBe(join(homedir(), ".mem-store", "custom-models"));
    });

    it("uses embeddingModel dimension map when dimensions not set", () => {
      writeConfigFile(`{
  "embeddingModel": "text-embedding-3-large"
}`);

      const config = getConfig("/test/project");

      expect(config.embeddingDimensions).toBe(3072);
    });

    it("uses explicit embeddingDimensions when set in config", () => {
      writeConfigFile(`{
  "embeddingModel": "text-embedding-3-small",
  "embeddingDimensions": 1024
}`);

      const config = getConfig("/test/project");

      expect(config.embeddingDimensions).toBe(1024);
    });

    it("does not create config file automatically when missing", () => {
      if (existsSync(configPath)) {
        unlinkSync(configPath);
      }
      expect(existsSync(configPath)).toBe(false);

      getConfig("/test/project");

      expect(existsSync(configPath)).toBe(false);
    });
  });

  describe("getProjectStoragePath", () => {
    it("should produce consistent hash for same project path", () => {
      const projectPath = "/Users/test/project";
      const storagePath = "/storage";

      const path1 = getProjectStoragePath(storagePath, projectPath);
      const path2 = getProjectStoragePath(storagePath, projectPath);

      expect(path1).toBe(path2);
    });

    it("should produce different hash for different project paths", () => {
      const storagePath = "/storage";
      const projectPath1 = "/Users/test/project1";
      const projectPath2 = "/Users/test/project2";

      const path1 = getProjectStoragePath(storagePath, projectPath1);
      const path2 = getProjectStoragePath(storagePath, projectPath2);

      expect(path1).not.toBe(path2);
    });

    it("should contain storage path prefix", () => {
      const storagePath = "/storage";
      const projectPath = "/Users/test/project";

      const path = getProjectStoragePath(storagePath, projectPath);

      expect(path).toContain(storagePath);
      expect(path).toContain("memory.db");
    });

    it("should produce 12-character hash component", () => {
      const storagePath = "/storage";
      const projectPath = "/Users/test/project";

      const path = getProjectStoragePath(storagePath, projectPath);
      const hashComponent = path.split("/").slice(-2, -1)[0];

      expect(hashComponent?.length).toBe(12);
    });
  });

  describe("generateMemoryId", () => {
    it("should have mem_ prefix", () => {
      const id = generateMemoryId();

      expect(id).toMatch(/^mem_/);
    });

    it("should have format mem_<timestamp>_<random>", () => {
      const id = generateMemoryId();
      const parts = id.split("_");

      expect(parts.length).toBe(3);
      expect(parts[0]).toBe("mem");
      expect(parts[1]).toMatch(/^\d+$/); // timestamp is numeric
      expect(parts[2]?.length).toBe(8); // random UUID slice is 8 chars
    });

    it("should produce unique IDs", () => {
      const id1 = generateMemoryId();
      const id2 = generateMemoryId();

      expect(id1).not.toBe(id2);
    });

    it("should produce unique IDs even when called immediately", () => {
      const ids = new Set();
      for (let i = 0; i < 100; i++) {
        ids.add(generateMemoryId());
      }

      expect(ids.size).toBe(100);
    });
  });

  describe("Phase 2 config fields", () => {
    it("getDefaultConfig should return privacyPatterns as empty array", () => {
      const config = getConfig("/test/project");

      expect(config.privacyPatterns).toEqual([]);
    });

    it("getDefaultConfig should return dedupSimilarityThreshold as 0.7", () => {
      const config = getConfig("/test/project");

      expect(config.dedupSimilarityThreshold).toBe(0.7);
    });

    it("getDefaultConfig should return autoCaptureEnabled as true", () => {
      const config = getConfig("/test/project");

      expect(config.autoCaptureEnabled).toBe(true);
    });

    it("getDefaultConfig should return autoCaptureDelay as 10000", () => {
      const config = getConfig("/test/project");

      expect(config.autoCaptureDelay).toBe(10000);
    });

    it("getDefaultConfig should return autoCaptureMinImportance as 6", () => {
      const config = getConfig("/test/project");

      expect(config.autoCaptureMinImportance).toBe(6);
    });

    it("should override privacyPatterns from config file", () => {
      writeConfigFile(`{
  "privacyPatterns": ["password", "token", "secret"]
}`);

      const config = getConfig("/test/project");

      expect(config.privacyPatterns).toEqual(["password", "token", "secret"]);
    });

    it("should override dedupSimilarityThreshold from config file", () => {
      writeConfigFile(`{
  "dedupSimilarityThreshold": 0.9
}`);

      const config = getConfig("/test/project");

      expect(config.dedupSimilarityThreshold).toBe(0.9);
    });

    it("should override autoCaptureEnabled from config file", () => {
      writeConfigFile(`{
  "autoCaptureEnabled": false
}`);

      const config = getConfig("/test/project");

      expect(config.autoCaptureEnabled).toBe(false);
    });

    it("should override autoCaptureDelay from config file", () => {
      writeConfigFile(`{
  "autoCaptureDelay": 5000
}`);

      const config = getConfig("/test/project");

      expect(config.autoCaptureDelay).toBe(5000);
    });

    it("should override autoCaptureMinImportance from config file", () => {
      writeConfigFile(`{
  "autoCaptureMinImportance": 8
}`);

      const config = getConfig("/test/project");

      expect(config.autoCaptureMinImportance).toBe(8);
    });

    it("should fall back to default when privacyPatterns has invalid types", () => {
      writeConfigFile(`{
  "privacyPatterns": ["valid", 123, null, "another"]
}`);

      const config = getConfig("/test/project");

      expect(config.privacyPatterns).toEqual(["valid", "another"]);
    });

    it("should fall back to default when dedupSimilarityThreshold is not a number", () => {
      writeConfigFile(`{
  "dedupSimilarityThreshold": "not-a-number"
}`);

      const config = getConfig("/test/project");

      expect(config.dedupSimilarityThreshold).toBe(0.7);
    });

    it("should fall back to default when autoCaptureEnabled is not a boolean", () => {
      writeConfigFile(`{
  "autoCaptureEnabled": 42
}`);

      const config = getConfig("/test/project");

      expect(config.autoCaptureEnabled).toBe(true);
    });

    it("should fall back to default when autoCaptureDelay is not a number", () => {
      writeConfigFile(`{
  "autoCaptureDelay": true
}`);

      const config = getConfig("/test/project");

      expect(config.autoCaptureDelay).toBe(10000);
    });

    it("should fall back to default when autoCaptureMinImportance is not a number", () => {
      writeConfigFile(`{
  "autoCaptureMinImportance": []
}`);

      const config = getConfig("/test/project");

      expect(config.autoCaptureMinImportance).toBe(6);
    });
  });

  describe("searchLayersEnabled config", () => {
    it("should return searchLayersEnabled as true by default", () => {
      const config = getConfig("/test/project");

      expect(config.searchLayersEnabled).toBe(true);
    });

    it("should override searchLayersEnabled from config file when true", () => {
      writeConfigFile(`{
  "searchLayersEnabled": true
}`);

      const config = getConfig("/test/project");

      expect(config.searchLayersEnabled).toBe(true);
    });

    it("should override searchLayersEnabled from config file when false", () => {
      writeConfigFile(`{
  "searchLayersEnabled": false
}`);

      const config = getConfig("/test/project");

      expect(config.searchLayersEnabled).toBe(false);
    });

    it("should fall back to default when searchLayersEnabled is not a boolean", () => {
      writeConfigFile(`{
  "searchLayersEnabled": "true"
}`);

      const config = getConfig("/test/project");

      expect(config.searchLayersEnabled).toBe(true);
    });

    it("should fall back to default when searchLayersEnabled is a number", () => {
      writeConfigFile(`{
  "searchLayersEnabled": 1
}`);

      const config = getConfig("/test/project");

      expect(config.searchLayersEnabled).toBe(true);
    });
  });

  describe("Phase 3 config fields", () => {
    it("profileEnabled defaults to true", () => {
      const config = getConfig("/test/project");
      expect(config.profileEnabled).toBe(true);
    });

    it("profileExtractionMinPrompts defaults to 5", () => {
      const config = getConfig("/test/project");
      expect(config.profileExtractionMinPrompts).toBe(5);
    });

    it("profileMaxMessagesPerExtraction defaults to 20", () => {
      const config = getConfig("/test/project");
      expect(config.profileMaxMessagesPerExtraction).toBe(20);
    });

    it("webServerPort defaults to 18080", () => {
      const config = getConfig("/test/project");
      expect(config.webServerPort).toBe(18080);
    });

    it("profileEnabled can be set to false", () => {
      writeConfigFile(`{
  "profileEnabled": false
}`);
      const config = getConfig("/test/project");
      expect(config.profileEnabled).toBe(false);
    });

    it("webServerPort can be customized", () => {
      writeConfigFile(`{
  "webServerPort": 8888
}`);
      const config = getConfig("/test/project");
      expect(config.webServerPort).toBe(8888);
    });
  });

  describe("logLevel config", () => {
    it("default config has logLevel 'info'", () => {
      const config = getConfig("/test/project");
      expect(config.logLevel).toBe("info");
    });

    it("config with valid logLevel 'warn' is accepted", () => {
      writeConfigFile(`{
   "logLevel": "warn"
}`);
      const config = getConfig("/test/project");
      expect(config.logLevel).toBe("warn");
    });

    it("config with invalid logLevel falls back to 'info'", () => {
      writeConfigFile(`{
   "logLevel": "invalid"
}`);
      const config = getConfig("/test/project");
      expect(config.logLevel).toBe("info");
    });
  });

  describe("Phase 5 AI config fields", () => {
    it("default config has aiApiUrl as empty string", () => {
      const config = getConfig("/test/project");
      expect(config.aiApiUrl).toBe("");
    });

    it("default config has aiApiKey as empty string", () => {
      const config = getConfig("/test/project");
      expect(config.aiApiKey).toBe("");
    });

    it("default config has aiModel as empty string", () => {
      const config = getConfig("/test/project");
      expect(config.aiModel).toBe("");
    });

    it("default config has autoCaptureMode as 'heuristic'", () => {
      const config = getConfig("/test/project");
      expect(config.autoCaptureMode).toBe("heuristic");
    });

    it("custom config with autoCaptureMode 'ai' is accepted", () => {
      writeConfigFile(`{
   "autoCaptureMode": "ai"
}`);
      const config = getConfig("/test/project");
      expect(config.autoCaptureMode).toBe("ai");
    });

    it("custom config with autoCaptureMode 'hybrid' is accepted", () => {
      writeConfigFile(`{
   "autoCaptureMode": "hybrid"
}`);
      const config = getConfig("/test/project");
      expect(config.autoCaptureMode).toBe("hybrid");
    });

    it("invalid autoCaptureMode falls back to 'heuristic'", () => {
      writeConfigFile(`{
   "autoCaptureMode": "invalid"
}`);
      const config = getConfig("/test/project");
      expect(config.autoCaptureMode).toBe("heuristic");
    });

    it("aiApiKey with env:// prefix resolves environment variable", () => {
      process.env.TEST_OPENCODE_MEMORY_AI_KEY = "sk-test-key-from-env";
      writeConfigFile(`{
   "aiApiKey": "env://TEST_OPENCODE_MEMORY_AI_KEY"
}`);
      const config = getConfig("/test/project");
      expect(config.aiApiKey).toBe("sk-test-key-from-env");
      delete process.env.TEST_OPENCODE_MEMORY_AI_KEY;
    });

     it("plain aiApiKey is passed through unchanged", () => {
       writeConfigFile(`{
    "aiApiKey": "sk-abc123"
}`);
       const config = getConfig("/test/project");
       expect(config.aiApiKey).toBe("sk-abc123");
     });
   });

   describe("tokenBudget config", () => {
     it("default config has tokenBudget as undefined", () => {
       const config = getConfig("/test/project");
       expect(config.tokenBudget).toBeUndefined();
     });

     it("custom config with tokenBudget number is accepted", () => {
       writeConfigFile(`{
    "tokenBudget": 2000
}`);
       const config = getConfig("/test/project");
       expect(config.tokenBudget).toBe(2000);
     });

     it("invalid tokenBudget (string) falls back to undefined", () => {
       writeConfigFile(`{
    "tokenBudget": "not a number"
}`);
       const config = getConfig("/test/project");
       expect(config.tokenBudget).toBeUndefined();
     });
   });

   describe("makeConfig helper with tokenBudget", () => {
     it("makeConfig without override returns undefined tokenBudget", () => {
       const config = makeConfig();
       expect(config.tokenBudget).toBeUndefined();
     });

     it("makeConfig with tokenBudget override returns the value", () => {
       const config = makeConfig({ tokenBudget: 2000 });
       expect(config.tokenBudget).toBe(2000);
     });
   });
});
