import { mkdtempSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, afterEach, beforeEach } from "bun:test";
import { createLogger } from "../src/services/logger.js";
import type { Logger } from "../src/services/logger.js";

describe("createLogger (file-based)", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), "logger-test-"));
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it("returns object with debug/info/warn/error methods", () => {
    const logger = createLogger({ storagePath: testDir });

    expect(typeof logger.debug).toBe("function");
    expect(typeof logger.info).toBe("function");
    expect(typeof logger.warn).toBe("function");
    expect(typeof logger.error).toBe("function");
  });

  it("logger.info creates log file at {storagePath}/logs/YYYY-MM-DD.log", () => {
    const logger = createLogger({ storagePath: testDir });
    logger.info("hello");

    const today = new Date().toISOString().slice(0, 10);
    const logFile = join(testDir, "logs", `${today}.log`);

    expect(existsSync(logFile)).toBe(true);
  });

  it("logger.info writes line containing [INFO] and message text", () => {
    const logger = createLogger({ storagePath: testDir });
    logger.info("hello world");

    const today = new Date().toISOString().slice(0, 10);
    const logFile = join(testDir, "logs", `${today}.log`);
    const content = readFileSync(logFile, "utf-8");

    expect(content).toContain("[INFO]");
    expect(content).toContain("hello world");
  });

  it("logger.info with extra parameter writes JSON to file", () => {
    const logger = createLogger({ storagePath: testDir });
    logger.info("msg", { key: "value" });

    const today = new Date().toISOString().slice(0, 10);
    const logFile = join(testDir, "logs", `${today}.log`);
    const content = readFileSync(logFile, "utf-8");

    expect(content).toContain("msg");
    expect(content).toContain("key");
    expect(content).toContain("value");
  });

  it("logLevel 'warn' does not create file for logger.debug calls", () => {
    const logger = createLogger({ storagePath: testDir, logLevel: "warn" });
    logger.debug("debug message");

    const today = new Date().toISOString().slice(0, 10);
    const logFile = join(testDir, "logs", `${today}.log`);

    expect(existsSync(logFile)).toBe(false);
  });

  it("logLevel 'warn' does not create file for logger.info calls", () => {
    const logger = createLogger({ storagePath: testDir, logLevel: "warn" });
    logger.info("info message");

    const today = new Date().toISOString().slice(0, 10);
    const logFile = join(testDir, "logs", `${today}.log`);

    expect(existsSync(logFile)).toBe(false);
  });

  it("logLevel 'silent' does not create file for logger.error calls", () => {
    const logger = createLogger({ storagePath: testDir, logLevel: "silent" });
    logger.error("error message");

    const today = new Date().toISOString().slice(0, 10);
    const logFile = join(testDir, "logs", `${today}.log`);

    expect(existsSync(logFile)).toBe(false);
  });

  it("default logLevel (no options) allows debug messages through", () => {
    const logger = createLogger({ storagePath: testDir });
    logger.debug("debug message");

    const today = new Date().toISOString().slice(0, 10);
    const logFile = join(testDir, "logs", `${today}.log`);

    expect(existsSync(logFile)).toBe(true);
    const content = readFileSync(logFile, "utf-8");
    expect(content).toContain("[DEBUG]");
    expect(content).toContain("debug message");
  });

  it("auto-creates {storagePath}/logs/ directory if it does not exist", () => {
    const logger = createLogger({ storagePath: testDir });
    const logsDir = join(testDir, "logs");

    expect(existsSync(logsDir)).toBe(false);

    logger.info("test");

    expect(existsSync(logsDir)).toBe(true);
  });

  it("multiple log calls append to same file", () => {
    const logger = createLogger({ storagePath: testDir });
    logger.info("first message");
    logger.info("second message");

    const today = new Date().toISOString().slice(0, 10);
    const logFile = join(testDir, "logs", `${today}.log`);
    const content = readFileSync(logFile, "utf-8");

    expect(content).toContain("first message");
    expect(content).toContain("second message");

    const lines = content.trim().split("\n");
    expect(lines.length).toBe(2);
  });

  it("all four level tags appear correctly in output", () => {
    const logger = createLogger({ storagePath: testDir });
    logger.debug("debug msg");
    logger.info("info msg");
    logger.warn("warn msg");
    logger.error("error msg");

    const today = new Date().toISOString().slice(0, 10);
    const logFile = join(testDir, "logs", `${today}.log`);
    const content = readFileSync(logFile, "utf-8");

    expect(content).toContain("[DEBUG]");
    expect(content).toContain("[INFO]");
    expect(content).toContain("[WARN]");
    expect(content).toContain("[ERROR]");
  });

  it("does not throw when storagePath is invalid/unwritable", () => {
    const logger = createLogger({ storagePath: "/nonexistent/path/that/cannot/be/created" });

    expect(() => {
      logger.debug("msg");
      logger.info("msg");
      logger.warn("msg");
      logger.error("msg");
    }).not.toThrow();
  });

  it("logLevel 'warn' creates file for logger.warn calls", () => {
    const logger = createLogger({ storagePath: testDir, logLevel: "warn" });
    logger.warn("warn message");

    const today = new Date().toISOString().slice(0, 10);
    const logFile = join(testDir, "logs", `${today}.log`);

    expect(existsSync(logFile)).toBe(true);
    const content = readFileSync(logFile, "utf-8");
    expect(content).toContain("[WARN]");
    expect(content).toContain("warn message");
  });

  it("logLevel 'warn' creates file for logger.error calls", () => {
    const logger = createLogger({ storagePath: testDir, logLevel: "warn" });
    logger.error("error message");

    const today = new Date().toISOString().slice(0, 10);
    const logFile = join(testDir, "logs", `${today}.log`);

    expect(existsSync(logFile)).toBe(true);
    const content = readFileSync(logFile, "utf-8");
    expect(content).toContain("[ERROR]");
    expect(content).toContain("error message");
  });

  it("includes ISO timestamp in [YYYY-MM-DD HH:mm:ss] format", () => {
    const logger = createLogger({ storagePath: testDir });
    logger.info("test");

    const today = new Date().toISOString().slice(0, 10);
    const logFile = join(testDir, "logs", `${today}.log`);
    const content = readFileSync(logFile, "utf-8");

    const timestampPattern = /\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\]/;
    expect(content).toMatch(timestampPattern);
  });
});

describe("createLogger without storagePath", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), "logger-test-"));
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it("createLogger() with no options returns functional logger", () => {
    const logger = createLogger();

    expect(typeof logger.debug).toBe("function");
    expect(typeof logger.info).toBe("function");
    expect(typeof logger.warn).toBe("function");
    expect(typeof logger.error).toBe("function");

    expect(() => {
      logger.debug("msg");
      logger.info("msg");
      logger.warn("msg");
      logger.error("msg");
    }).not.toThrow();
  });
});

describe("createLogger with complex extra data", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), "logger-test-"));
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it("serializes nested extra objects as JSON", () => {
    const logger = createLogger({ storagePath: testDir });
    logger.info("action", { user: { id: 123, name: "Alice" }, status: "active" });

    const today = new Date().toISOString().slice(0, 10);
    const logFile = join(testDir, "logs", `${today}.log`);
    const content = readFileSync(logFile, "utf-8");

    expect(content).toContain("action");
    expect(content).toContain("Alice");
    expect(content).toContain("123");
  });

  it("serializes extra with arrays as JSON", () => {
    const logger = createLogger({ storagePath: testDir });
    logger.warn("batch operation", { ids: [1, 2, 3], status: "pending" });

    const today = new Date().toISOString().slice(0, 10);
    const logFile = join(testDir, "logs", `${today}.log`);
    const content = readFileSync(logFile, "utf-8");

    expect(content).toContain("batch operation");
    expect(content).toContain("1");
    expect(content).toContain("2");
    expect(content).toContain("3");
  });
});

describe("createLogger level filtering variations", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), "logger-test-"));
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it("logLevel 'info' does not log debug messages", () => {
    const logger = createLogger({ storagePath: testDir, logLevel: "info" });
    logger.debug("debug msg");

    const today = new Date().toISOString().slice(0, 10);
    const logFile = join(testDir, "logs", `${today}.log`);

    expect(existsSync(logFile)).toBe(false);
  });

  it("logLevel 'info' logs info and above (info, warn, error)", () => {
    const logger = createLogger({ storagePath: testDir, logLevel: "info" });
    logger.info("info msg");
    logger.warn("warn msg");
    logger.error("error msg");

    const today = new Date().toISOString().slice(0, 10);
    const logFile = join(testDir, "logs", `${today}.log`);
    const content = readFileSync(logFile, "utf-8");

    expect(content).toContain("[INFO]");
    expect(content).toContain("[WARN]");
    expect(content).toContain("[ERROR]");
    expect(content).not.toContain("[DEBUG]");
  });

  it("logLevel 'error' only logs error messages", () => {
    const logger = createLogger({ storagePath: testDir, logLevel: "error" });
    logger.debug("debug msg");
    logger.info("info msg");
    logger.warn("warn msg");
    logger.error("error msg");

    const today = new Date().toISOString().slice(0, 10);
    const logFile = join(testDir, "logs", `${today}.log`);
    const content = readFileSync(logFile, "utf-8");

    const lines = content.trim().split("\n");
    expect(lines.length).toBe(1);
    expect(content).toContain("[ERROR]");
    expect(content).toContain("error msg");
  });
});
