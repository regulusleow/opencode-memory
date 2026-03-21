import { describe, it, expect, vi, beforeEach } from "bun:test";
import { createEventHandler } from "../src/services/event-handler.js";
import type { PluginConfig } from "../src/types.js";
import type { Logger } from "../src/services/logger.js";

function makeConfig(overrides: Partial<PluginConfig> = {}): PluginConfig {
  return {
    embeddingApiUrl: "",
    embeddingApiKey: "",
    embeddingModel: "",
    embeddingDimensions: 1536,
    storagePath: "",
    searchLimit: 5,
    contextLimit: 3,
    embeddingBackend: "auto",
    localModel: "",
    localDtype: "",
    localCacheDir: "",
    privacyPatterns: [],
    dedupSimilarityThreshold: 0.7,
    autoCaptureEnabled: true,
    autoCaptureDelay: 10000,
    autoCaptureMinImportance: 6,
    searchLayersEnabled: false,
    profileEnabled: true,
    profileExtractionMinPrompts: 5,
    profileMaxMessagesPerExtraction: 50,
    webServerPort: 3000,
    ...overrides,
  };
}

function makeLogger(): Logger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

function makeEvent(type: string, sessionID: string) {
  return { event: { type, properties: { sessionID } } };
}

describe("Event Handler", () => {
  let needsReinjection: Set<string>;
  let mockOnIdle: ReturnType<typeof vi.fn>;
  let logger: Logger;

  beforeEach(() => {
    needsReinjection = new Set<string>();
    mockOnIdle = vi.fn(async () => {});
    logger = makeLogger();
  });

  it("session.idle triggers onIdle callback with correct sessionID", async () => {
    const handler = createEventHandler({
      needsReinjection,
      onIdle: mockOnIdle,
      config: makeConfig(),
      logger,
    });

    await handler(makeEvent("session.idle", "ses_123"));

    expect(mockOnIdle).toHaveBeenCalledTimes(1);
    expect(mockOnIdle).toHaveBeenCalledWith("ses_123");
  });

  it("session.compacted adds sessionID to needsReinjection", async () => {
    const handler = createEventHandler({
      needsReinjection,
      onIdle: mockOnIdle,
      config: makeConfig(),
      logger,
    });

    await handler(makeEvent("session.compacted", "ses_456"));

    expect(needsReinjection.has("ses_456")).toBe(true);
    expect((logger.info as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
      "Session compacted, flagged for re-injection",
      { sessionID: "ses_456" }
    );
  });

  it("unknown event type does not throw and does not call onIdle", async () => {
    const handler = createEventHandler({
      needsReinjection,
      onIdle: mockOnIdle,
      config: makeConfig(),
      logger,
    });

    await handler(makeEvent("session.created", "ses_789"));

    expect(mockOnIdle).not.toHaveBeenCalled();
    expect(needsReinjection.size).toBe(0);
  });

  it("per-session concurrency lock: two concurrent idle events for same session calls onIdle only once", async () => {
    let resolveFirst!: () => void;
    const firstCallDone = new Promise<void>((r) => {
      resolveFirst = r;
    });
    let callCount = 0;
    const slowOnIdle = vi.fn(async () => {
      callCount++;
      await firstCallDone;
    });

    const handler = createEventHandler({
      needsReinjection,
      onIdle: slowOnIdle,
      config: makeConfig(),
      logger,
    });

    const p1 = handler(makeEvent("session.idle", "ses_A"));
    const p2 = handler(makeEvent("session.idle", "ses_A"));

    resolveFirst();
    await Promise.all([p1, p2]);

    expect(callCount).toBe(1);
  });

  it("lock released after processing: second idle event after completion triggers onIdle", async () => {
    const handler = createEventHandler({
      needsReinjection,
      onIdle: mockOnIdle,
      config: makeConfig(),
      logger,
    });

    await handler(makeEvent("session.idle", "ses_B"));
    expect(mockOnIdle).toHaveBeenCalledTimes(1);

    await handler(makeEvent("session.idle", "ses_B"));
    expect(mockOnIdle).toHaveBeenCalledTimes(2);
  });

  it("onIdle throwing does not cause unhandled rejection and releases lock", async () => {
    const failingOnIdle = vi.fn<(sessionID: string) => Promise<void>>(async () => {
      throw new Error("onIdle failed");
    });

    const handler = createEventHandler({
      needsReinjection,
      onIdle: failingOnIdle,
      config: makeConfig(),
      logger,
    });

    await expect(handler(makeEvent("session.idle", "ses_C"))).rejects.toThrow("onIdle failed");

    failingOnIdle.mockImplementation(async () => {});
    await handler(makeEvent("session.idle", "ses_C"));
    expect(failingOnIdle).toHaveBeenCalledTimes(2);
  });

  it("autoCaptureEnabled: false prevents onIdle from being called", async () => {
    const handler = createEventHandler({
      needsReinjection,
      onIdle: mockOnIdle,
      config: makeConfig({ autoCaptureEnabled: false }),
      logger,
    });

    await handler(makeEvent("session.idle", "ses_D"));

    expect(mockOnIdle).not.toHaveBeenCalled();
  });

  it("different sessions are independently locked", async () => {
    let resolveA!: () => void;
    const doneA = new Promise<void>((r) => {
      resolveA = r;
    });
    const callArgs: string[] = [];
    const trackingOnIdle = vi.fn(async (sessionID: string) => {
      callArgs.push(sessionID);
      if (sessionID === "ses_X") await doneA;
    });

    const handler = createEventHandler({
      needsReinjection,
      onIdle: trackingOnIdle,
      config: makeConfig(),
      logger,
    });

    const pX = handler(makeEvent("session.idle", "ses_X"));
    const pY = handler(makeEvent("session.idle", "ses_Y"));

    await new Promise((r) => setTimeout(r, 10));
    expect(callArgs).toContain("ses_Y");

    resolveA();
    await Promise.all([pX, pY]);
    expect(callArgs).toContain("ses_X");
    expect(callArgs).toContain("ses_Y");
  });

  it("session.idle triggers onIdleProfile when profileEnabled=true", async () => {
    const mockOnIdleProfile = vi.fn<(sessionID: string) => Promise<void>>(async () => {});
    const handler = createEventHandler({
      needsReinjection,
      onIdle: mockOnIdle,
      onIdleProfile: mockOnIdleProfile,
      config: makeConfig({ profileEnabled: true }),
      logger,
    });

    await handler(makeEvent("session.idle", "ses_profile_1"));

    expect(mockOnIdleProfile).toHaveBeenCalledTimes(1);
    expect(mockOnIdleProfile).toHaveBeenCalledWith("ses_profile_1");
  });

  it("session.idle does NOT call onIdleProfile when profileEnabled=false", async () => {
    const mockOnIdleProfile = vi.fn<(sessionID: string) => Promise<void>>(async () => {});
    const handler = createEventHandler({
      needsReinjection,
      onIdle: mockOnIdle,
      onIdleProfile: mockOnIdleProfile,
      config: makeConfig({ profileEnabled: false }),
      logger,
    });

    await handler(makeEvent("session.idle", "ses_profile_2"));

    expect(mockOnIdleProfile).not.toHaveBeenCalled();
  });

  it("onIdleProfile failure does not affect onIdle completion", async () => {
    const mockOnIdleProfile = vi.fn<(sessionID: string) => Promise<void>>(async () => {
      throw new Error("Profile extraction failed");
    });
    const handler = createEventHandler({
      needsReinjection,
      onIdle: mockOnIdle,
      onIdleProfile: mockOnIdleProfile,
      config: makeConfig({ profileEnabled: true }),
      logger,
    });

    await handler(makeEvent("session.idle", "ses_profile_3"));

    expect(mockOnIdle).toHaveBeenCalledTimes(1);
    expect(mockOnIdleProfile).toHaveBeenCalledTimes(1);
    expect((logger.error as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
      "Profile extraction failed",
      expect.objectContaining({ sessionID: "ses_profile_3" })
    );
  });

  it("both onIdle and onIdleProfile are called on session.idle", async () => {
    const mockOnIdleProfile = vi.fn<(sessionID: string) => Promise<void>>(async () => {});
    const handler = createEventHandler({
      needsReinjection,
      onIdle: mockOnIdle,
      onIdleProfile: mockOnIdleProfile,
      config: makeConfig({ profileEnabled: true }),
      logger,
    });

    await handler(makeEvent("session.idle", "ses_both_1"));

    expect(mockOnIdle).toHaveBeenCalledTimes(1);
    expect(mockOnIdleProfile).toHaveBeenCalledTimes(1);
  });
});
