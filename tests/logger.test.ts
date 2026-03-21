import { describe, it, expect, mock } from "bun:test";
import { createLogger } from "../src/services/logger.js";

describe("createLogger", () => {
  it("returns object with debug/info/warn/error methods", () => {
    const mockClient = {
      app: {
        log: mock(async () => undefined),
      },
    };
    const logger = createLogger(mockClient);

    expect(typeof logger.debug).toBe("function");
    expect(typeof logger.info).toBe("function");
    expect(typeof logger.warn).toBe("function");
    expect(typeof logger.error).toBe("function");
  });

  it("each level passes correct body to client.app.log()", async () => {
    const mockLog = mock(async () => undefined);
    const mockClient = {
      app: {
        log: mockLog,
      },
    };
    const logger = createLogger(mockClient);

    logger.debug("test debug message");
    expect(mockLog).toHaveBeenCalledWith({
      body: {
        service: "opencode-memory",
        level: "debug",
        message: "test debug message",
        extra: undefined,
      },
    });

    logger.info("test info message");
    expect(mockLog).toHaveBeenCalledWith({
      body: {
        service: "opencode-memory",
        level: "info",
        message: "test info message",
        extra: undefined,
      },
    });

    logger.warn("test warn message");
    expect(mockLog).toHaveBeenCalledWith({
      body: {
        service: "opencode-memory",
        level: "warn",
        message: "test warn message",
        extra: undefined,
      },
    });

    logger.error("test error message");
    expect(mockLog).toHaveBeenCalledWith({
      body: {
        service: "opencode-memory",
        level: "error",
        message: "test error message",
        extra: undefined,
      },
    });
  });

  it("does NOT propagate exceptions when client.app.log() throws", () => {
    const mockClient = {
      app: {
        log: mock(async () => {
          throw new Error("Network error");
        }),
      },
    };
    const logger = createLogger(mockClient);

    // should not throw
    expect(() => {
      logger.debug("message");
    }).not.toThrow();

    expect(() => {
      logger.info("message");
    }).not.toThrow();

    expect(() => {
      logger.warn("message");
    }).not.toThrow();

    expect(() => {
      logger.error("message");
    }).not.toThrow();
  });

  it("passes extra parameter through to client.app.log() body", () => {
    const mockLog = mock(async () => undefined);
    const mockClient = {
      app: {
        log: mockLog,
      },
    };
    const logger = createLogger(mockClient);

    const extra = { userId: "user_123", sessionId: "sess_456" };
    logger.info("user action", extra);

    expect(mockLog).toHaveBeenCalledWith({
      body: {
        service: "opencode-memory",
        level: "info",
        message: "user action",
        extra: extra,
      },
    });
  });

  it("createLogger(null) — all methods are no-ops and do not crash", () => {
    const logger = createLogger(null);

    // should not throw
    expect(() => {
      logger.debug("message");
      logger.info("message");
      logger.warn("message");
      logger.error("message");
    }).not.toThrow();

    // calling with extra also should not throw
    expect(() => {
      logger.debug("message", { extra: "data" });
    }).not.toThrow();
  });
});
