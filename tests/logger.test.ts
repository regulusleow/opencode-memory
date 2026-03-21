import { describe, it, expect, mock, spyOn, afterEach } from "bun:test";
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

describe("logger level filtering", () => {
  function makeMockClient() {
    return {
      app: {
        log: mock(async () => undefined),
      },
    };
  }

  it("logLevel 'warn' filters out debug calls", () => {
    const client = makeMockClient();
    const logger = createLogger(client, { logLevel: "warn" });
    logger.debug("msg");
    expect(client.app.log).not.toHaveBeenCalled();
  });

  it("logLevel 'warn' filters out info calls", () => {
    const client = makeMockClient();
    const logger = createLogger(client, { logLevel: "warn" });
    logger.info("msg");
    expect(client.app.log).not.toHaveBeenCalled();
  });

  it("logLevel 'warn' passes warn calls through", () => {
    const client = makeMockClient();
    const logger = createLogger(client, { logLevel: "warn" });
    logger.warn("msg");
    expect(client.app.log).toHaveBeenCalledTimes(1);
  });

  it("logLevel 'warn' passes error calls through", () => {
    const client = makeMockClient();
    const logger = createLogger(client, { logLevel: "warn" });
    logger.error("msg");
    expect(client.app.log).toHaveBeenCalledTimes(1);
  });

  it("default logLevel (no options) passes debug through for backward compat", () => {
    const client = makeMockClient();
    const logger = createLogger(client);
    logger.debug("msg");
    expect(client.app.log).toHaveBeenCalledTimes(1);
  });

  it("explicit logLevel 'info' filters out debug but passes info", () => {
    const client = makeMockClient();
    const logger = createLogger(client, { logLevel: "info" });
    logger.debug("msg");
    expect(client.app.log).not.toHaveBeenCalled();
    logger.info("msg");
    expect(client.app.log).toHaveBeenCalledTimes(1);
  });
});

describe("logger console fallback", () => {
  let debugSpy: ReturnType<typeof spyOn>;
  let infoSpy: ReturnType<typeof spyOn>;
  let warnSpy: ReturnType<typeof spyOn>;
  let errorSpy: ReturnType<typeof spyOn>;

  afterEach(() => {
    debugSpy?.mockRestore();
    infoSpy?.mockRestore();
    warnSpy?.mockRestore();
    errorSpy?.mockRestore();
  });

  it("falls back to console.debug when client is null", () => {
    debugSpy = spyOn(console, "debug").mockImplementation(() => {});
    const logger = createLogger(null, { logLevel: "debug" });
    logger.debug("msg");
    expect(debugSpy).toHaveBeenCalledWith("[opencode-memory]", "msg");
  });

  it("falls back to console.info when client is null", () => {
    infoSpy = spyOn(console, "info").mockImplementation(() => {});
    const logger = createLogger(null, { logLevel: "debug" });
    logger.info("msg");
    expect(infoSpy).toHaveBeenCalledWith("[opencode-memory]", "msg");
  });

  it("falls back to console.warn when client is null", () => {
    warnSpy = spyOn(console, "warn").mockImplementation(() => {});
    const logger = createLogger(null, { logLevel: "debug" });
    logger.warn("msg");
    expect(warnSpy).toHaveBeenCalledWith("[opencode-memory]", "msg");
  });

  it("falls back to console.error when client is null", () => {
    errorSpy = spyOn(console, "error").mockImplementation(() => {});
    const logger = createLogger(null, { logLevel: "debug" });
    logger.error("msg");
    expect(errorSpy).toHaveBeenCalledWith("[opencode-memory]", "msg");
  });
});

describe("logger silent mode", () => {
  it("silent mode with client does not call client.app.log", () => {
    const client = {
      app: {
        log: mock(async () => undefined),
      },
    };
    const logger = createLogger(client, { logLevel: "silent" });
    logger.error("msg");
    expect(client.app.log).not.toHaveBeenCalled();
  });

  it("silent mode without client does not call console.error", () => {
    const errorSpy = spyOn(console, "error").mockImplementation(() => {});
    const logger = createLogger(null, { logLevel: "silent" });
    logger.error("msg");
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});

describe("logger level controls console too", () => {
  it("logLevel 'error' with null client filters console.warn", () => {
    const warnSpy = spyOn(console, "warn").mockImplementation(() => {});
    const logger = createLogger(null, { logLevel: "error" });
    logger.warn("msg");
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
