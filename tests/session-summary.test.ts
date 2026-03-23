import { describe, it, expect, mock, beforeEach } from "bun:test";
import type { AiService } from "../src/types.js";
import type { MemoryStore } from "../src/services/memory-store.js";
import type { Logger } from "../src/services/logger.js";
import { makeConfig, makeMockStore, makeMockLogger } from "./helpers.js";
import { createEventHandler } from "../src/services/event-handler.js";
import { createSessionSummary } from "../src/services/session-summary.js";

function makeAiService(configured = true): AiService {
  return {
    complete: mock(async () => "Summary: This session focused on X..."),
    isConfigured: mock(() => configured),
  };
}

function makeMessages(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    role: i % 2 === 0 ? "user" : "assistant",
    content: `Message ${i + 1}`,
    id: `msg_${i + 1}`,
  }));
}

function makeClient(messages: any[]) {
  return {
    session: {
      messages: mock(async () => messages),
    },
  };
}

describe("createSessionSummary service", () => {
  let store: MemoryStore;
  let logger: Logger;

  beforeEach(() => {
    store = makeMockStore();
    logger = makeMockLogger();
  });

  it("generateSummary() returns summary string when AI is configured and messages >= threshold", async () => {
    const aiService = makeAiService(true);
    const service = createSessionSummary({
      aiService,
      store,
      config: makeConfig({ profileMaxMessagesPerExtraction: 20 }),
      logger,
      minMessages: 5,
    });

    const messages = makeMessages(6);
    const result = await service.generateSummary("ses_123", messages);

    expect(result).toBeTruthy();
    expect(typeof result).toBe("string");
    expect(aiService.complete).toHaveBeenCalled();
  });

  it("generateSummary() returns null when AI is not configured (isConfigured() returns false)", async () => {
    const aiService = makeAiService(false);
    const service = createSessionSummary({
      aiService,
      store,
      config: makeConfig({ profileMaxMessagesPerExtraction: 20 }),
      logger,
      minMessages: 5,
    });

    const messages = makeMessages(10);
    const result = await service.generateSummary("ses_123", messages);

    expect(result).toBeNull();
    expect(aiService.complete).not.toHaveBeenCalled();
  });

  it("generateSummary() returns null when messages count below threshold (default: 5)", async () => {
    const aiService = makeAiService(true);
    const service = createSessionSummary({
      aiService,
      store,
      config: makeConfig({ profileMaxMessagesPerExtraction: 20 }),
      logger,
      minMessages: 5,
    });

    const messages = makeMessages(4);
    const result = await service.generateSummary("ses_123", messages);

    expect(result).toBeNull();
    expect(aiService.complete).not.toHaveBeenCalled();
  });

  it("generateSummary() truncates messages to max N (config.profileMaxMessagesPerExtraction)", async () => {
    const aiService = makeAiService(true);
    const maxMessages = 10;
    const service = createSessionSummary({
      aiService,
      store,
      config: makeConfig({ profileMaxMessagesPerExtraction: maxMessages }),
      logger,
      minMessages: 5,
    });

    const messages = makeMessages(30);
    await service.generateSummary("ses_123", messages);

    expect(aiService.complete).toHaveBeenCalled();
    const callArgs = (aiService.complete as any).mock.calls[0];
    expect(callArgs[0]).toContain("Message");
  });

  it("generateSummary() calls aiService.complete() with message content in prompt", async () => {
    const aiService = makeAiService(true);
    const service = createSessionSummary({
      aiService,
      store,
      config: makeConfig({ profileMaxMessagesPerExtraction: 20 }),
      logger,
      minMessages: 5,
    });

    const messages = makeMessages(6);
    await service.generateSummary("ses_123", messages);

    expect(aiService.complete).toHaveBeenCalled();
    const callArgs = (aiService.complete as any).mock.calls[0];
    expect(callArgs[0]).toContain("Message");
  });

  it("storeSummary() stores result with type='session-summary' and session ID in tags", async () => {
    const aiService = makeAiService(true);
    const service = createSessionSummary({
      aiService,
      store,
      config: makeConfig({ profileMaxMessagesPerExtraction: 20 }),
      logger,
      minMessages: 5,
    });

    const summaryText = "This session covered X and Y";
    await service.storeSummary("ses_123", summaryText);

    expect(store.add).toHaveBeenCalled();
    const [content, options] = (store.add as any).mock.calls[0];
    expect(content).toBe(summaryText);
    expect(options.type).toBe("session-summary");
    expect(options.tags).toContain("ses_123");
  });
});

describe("event handler onIdleSummary integration", () => {
  let store: MemoryStore;
  let logger: Logger;

  beforeEach(() => {
    store = makeMockStore();
    logger = makeMockLogger();
  });

  it("session.idle triggers onIdleSummary callback when provided", async () => {
    const onIdleSummary = mock(async (sessionID: string) => {});
    const handler = createEventHandler({
      needsReinjection: new Set(),
      onIdle: mock(async () => {}),
      onIdleSummary,
      config: makeConfig({ autoCaptureEnabled: true }),
      logger,
    });

    await handler({
      event: {
        type: "session.idle",
        properties: { sessionID: "ses_test_123" },
      },
    });

    expect(onIdleSummary).toHaveBeenCalledWith("ses_test_123");
  });

  it("onIdleSummary failure does not affect auto-capture completion", async () => {
    const onIdleError = new Error("Summary generation failed");
    const onIdleSummary = mock(async () => {
      throw onIdleError;
    });
    const onIdle = mock(async () => {});

    const handler = createEventHandler({
      needsReinjection: new Set(),
      onIdle,
      onIdleSummary,
      config: makeConfig({ autoCaptureEnabled: true }),
      logger,
    });

    await expect(
      handler({
        event: {
          type: "session.idle",
          properties: { sessionID: "ses_test_456" },
        },
      })
    ).resolves.toBeUndefined();

    expect(onIdle).toHaveBeenCalledWith("ses_test_456");
  });

  it("session.idle skips summary when AI not configured — logged at debug level (not error/warn)", async () => {
    const aiService = makeAiService(false);
    const service = createSessionSummary({
      aiService,
      store,
      config: makeConfig({ profileMaxMessagesPerExtraction: 20 }),
      logger,
      minMessages: 5,
    });

    const messages = makeMessages(10);
    await service.generateSummary("ses_789", messages);

    expect(aiService.complete).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalled();
  });
});
