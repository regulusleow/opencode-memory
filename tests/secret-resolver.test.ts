import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { resolveSecret } from "../src/services/secret-resolver";

describe("secret-resolver", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join("/tmp", "secret-resolver-test-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe("resolveSecret", () => {
    it("returns plain string as-is", () => {
      const result = resolveSecret("sk-abc123");
      expect(result).toBe("sk-abc123");
    });

    it("handles empty string and returns it unchanged", () => {
      const result = resolveSecret("");
      expect(result).toBe("");
    });

    it("resolves file:// prefix by reading file synchronously", () => {
      const testFile = join(tempDir, "secret-key.txt");
      writeFileSync(testFile, "secret-key-from-file");

      const result = resolveSecret(`file://${testFile}`);
      expect(result).toBe("secret-key-from-file");
    });

    it("trims whitespace from file content", () => {
      const testFile = join(tempDir, "key-with-whitespace.txt");
      writeFileSync(testFile, "  secret-key  \n");

      const result = resolveSecret(`file://${testFile}`);
      expect(result).toBe("secret-key");
    });

    it("throws descriptive error for non-existent file:// path", () => {
      const nonExistent = join(tempDir, "does-not-exist.txt");

      expect(() => {
        resolveSecret(`file://${nonExistent}`);
      }).toThrow();

      const error = expect(() => {
        resolveSecret(`file://${nonExistent}`);
      }).toThrow();
    });

    it("resolves env:// prefix by reading environment variable", () => {
      process.env.TEST_SECRET_KEY = "secret-from-env";

      const result = resolveSecret("env://TEST_SECRET_KEY");
      expect(result).toBe("secret-from-env");

      delete process.env.TEST_SECRET_KEY;
    });

    it("throws descriptive error for unset environment variable", () => {
      delete process.env.NONEXISTENT_SECRET_VAR;

      expect(() => {
        resolveSecret("env://NONEXISTENT_SECRET_VAR");
      }).toThrow();
    });

    it("handles file:// path with multiple slashes after prefix", () => {
      const testFile = join(tempDir, "key.txt");
      writeFileSync(testFile, "multi-slash-test");

      const result = resolveSecret(`file://${testFile}`);
      expect(result).toBe("multi-slash-test");
    });

    it("returns value containing env:// substring if not at start", () => {
      const result = resolveSecret("prefix-env://VAR-suffix");
      expect(result).toBe("prefix-env://VAR-suffix");
    });

    it("returns value containing file:// substring if not at start", () => {
      const result = resolveSecret("prefix-file://path-suffix");
      expect(result).toBe("prefix-file://path-suffix");
    });
  });
});
