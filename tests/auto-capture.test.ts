import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { Logger } from "../src/services/logger.js";
import type { MemoryStore } from "../src/services/memory-store.js";
import type { AiService, Memory, PluginConfig } from "../src/types.js";
import {
  createAutoCapture,
  getExtractionPrompt,
  getExtractionSchema,
  parseExtractionResponse,
  scoreImportance,
} from "../src/services/auto-capture.js";

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
    autoCaptureDelay: 0,
    autoCaptureMinImportance: 6,
    aiApiUrl: "",
    aiApiKey: "",
    aiModel: "",
    autoCaptureMode: "heuristic",
    searchLayersEnabled: true,
    profileEnabled: true,
    profileExtractionMinPrompts: 5,
    profileMaxMessagesPerExtraction: 20,
    webServerPort: 18080,
    logLevel: "info",
    ...overrides,
  };
}

function makeMemory(content: string): Memory {
  const now = Date.now();
  return {
    id: `mem_${Math.random().toString(36).slice(2)}`,
    content,
    tags: "auto-captured",
    type: "auto",
    metadata: {},
    embeddingStatus: "done",
    createdAt: now,
    updatedAt: now,
  };
}

function makeStore() {
  const add = mock(async (content: string) => makeMemory(content));

  const store: MemoryStore = {
    add,
    search: mock(async () => []),
    list: mock(async () => []),
    forget: mock(async () => true),
    get: mock(async () => null),
    retryPendingEmbeddings: mock(async () => 0),
  };

  return { store, add };
}

function makeLogger(): Logger {
  return {
    debug: mock(() => {}),
    info: mock(() => {}),
    warn: mock(() => {}),
    error: mock(() => {}),
  };
}

function makeClient(messages: Array<{ info: any; parts: any[] }>) {
  return {
    session: {
      messages: mock(async () => messages),
    },
  };
}

describe("scoreImportance", () => {
  it("returns baseline 5 for plain short text", () => {
    expect(scoreImportance("ok")).toBe(5);
  });

  it("adds +2 for each matching keyword", () => {
    const score = scoreImportance("decision architecture bug");
    expect(score).toBe(11);
  });

  it("adds +1 when text length is over 200", () => {
    const longText = "a".repeat(201);
    expect(scoreImportance(longText)).toBe(6);
  });

  it("adds +1 when text contains fenced code block marker", () => {
    expect(scoreImportance("here is code ```const a = 1;```")).toBe(6);
  });
});

describe("createAutoCapture", () => {
  let logger: Logger;

  beforeEach(() => {
    logger = makeLogger();
  });

  it("stores high-importance text", async () => {
    const { store, add } = makeStore();
    const client = makeClient([
      {
        info: {},
        parts: [{ type: "text", text: "We made a key decision today" }],
      },
    ]);

    const capture = createAutoCapture({ client, store, config: makeConfig(), logger });
    await capture("ses_1");

    expect(add).toHaveBeenCalledTimes(1);
    expect(add).toHaveBeenCalledWith("We made a key decision today", {
      tags: "auto-captured",
      type: "auto",
    });
  });

  it("does not store low-importance text", async () => {
    const { store, add } = makeStore();
    const client = makeClient([
      {
        info: {},
        parts: [{ type: "text", text: "ok" }],
      },
    ]);

    const capture = createAutoCapture({ client, store, config: makeConfig(), logger });
    await capture("ses_2");

    expect(add).not.toHaveBeenCalled();
  });

  it("caps auto-captured records to top 3", async () => {
    const { store, add } = makeStore();
    const client = makeClient([
      { info: {}, parts: [{ type: "text", text: "decision" }] },
      { info: {}, parts: [{ type: "text", text: "decision architecture" }] },
      { info: {}, parts: [{ type: "text", text: "decision architecture bug" }] },
      { info: {}, parts: [{ type: "text", text: "decision architecture bug fix" }] },
      {
        info: {},
        parts: [
          {
            type: "text",
            text: "decision architecture bug fix lesson",
          },
        ],
      },
    ]);

    const capture = createAutoCapture({ client, store, config: makeConfig(), logger });
    await capture("ses_3");

    expect(add).toHaveBeenCalledTimes(3);
  });

  it("only evaluates TextPart and ignores ToolPart", async () => {
    const { store, add } = makeStore();
    const client = makeClient([
      {
        info: {},
        parts: [
          { type: "text", text: "ok" },
          { type: "tool", text: "decision architecture bug" },
        ],
      },
    ]);

    const capture = createAutoCapture({ client, store, config: makeConfig(), logger });
    await capture("ses_4");

    expect(add).not.toHaveBeenCalled();
  });

  it("does nothing when messages list is empty", async () => {
    const { store, add } = makeStore();
    const client = makeClient([]);

    const capture = createAutoCapture({ client, store, config: makeConfig(), logger });
    await capture("ses_5");

    expect(add).not.toHaveBeenCalled();
  });

  it("catches client error and logs failure", async () => {
    const { store } = makeStore();
    const client = {
      session: {
        messages: mock(async () => {
          throw new Error("network down");
        }),
      },
    };

    const capture = createAutoCapture({ client, store, config: makeConfig(), logger });

    await capture("ses_6");
    expect(logger.error as ReturnType<typeof mock>).toHaveBeenCalledTimes(1);
    expect(logger.error as ReturnType<typeof mock>).toHaveBeenCalledWith(
      "Auto-capture failed",
      expect.objectContaining({ sessionID: "ses_6" })
    );
  });

  it("completes successfully with zero delay", async () => {
    const { store } = makeStore();
    const client = makeClient([
      {
        info: {},
        parts: [{ type: "text", text: "decision" }],
      },
    ]);

    const capture = createAutoCapture({
      client,
      store,
      config: makeConfig({ autoCaptureDelay: 0 }),
      logger,
    });

    await capture("ses_7");
    expect(client.session.messages).toHaveBeenCalledTimes(1);
  });
});

describe("auto-capture extraction helpers", () => {
  it("getExtractionPrompt returns instruction-oriented non-empty text", () => {
    const prompt = getExtractionPrompt(["text1", "text2"]);

    expect(prompt.length).toBeGreaterThan(0);
    expect(prompt.toLowerCase()).toContain("extract");
    expect(prompt.toLowerCase()).toContain("memories");
  });

  it("getExtractionSchema returns object schema with memories property", () => {
    const schema = getExtractionSchema() as {
      type?: string;
      properties?: Record<string, unknown>;
    };

    expect(schema.type).toBe("object");
    expect(schema.properties?.memories).toBeDefined();
  });

  it("parseExtractionResponse returns valid memories", () => {
    expect(parseExtractionResponse('{"memories":[{"content":"test","tags":"tag1"}]}')).toEqual({
      memories: [{ content: "test", tags: "tag1" }],
    });
  });

  it("parseExtractionResponse handles empty memories array", () => {
    expect(parseExtractionResponse('{"memories":[]}')).toEqual({ memories: [] });
  });

  it("parseExtractionResponse returns empty memories on invalid JSON", () => {
    expect(parseExtractionResponse("invalid json")).toEqual({ memories: [] });
  });

  it("parseExtractionResponse filters empty entries", () => {
    expect(parseExtractionResponse('{"memories":[{"content":"","tags":""}]}')).toEqual({
      memories: [],
    });
  });

  it("parseExtractionResponse keeps valid entries and drops invalid ones", () => {
    expect(
      parseExtractionResponse('{"memories":[{"content":"valid","tags":"ok"},{"content":"","tags":""}]}')
    ).toEqual({
      memories: [{ content: "valid", tags: "ok" }],
    });
  });
});

describe("createAutoCapture mode behavior", () => {
  let logger: Logger;

  beforeEach(() => {
    logger = makeLogger();
  });

  it("AI mode stores memories returned by aiService", async () => {
    const { store, add } = makeStore();
    const client = makeClient([
      { info: { role: "user" }, parts: [{ type: "text", text: "I decided to use approach A" }] },
      { info: { role: "assistant" }, parts: [{ type: "text", text: "This is important to remember" }] },
    ]);
    const mockAiService: AiService = {
      complete: mock(async () => JSON.stringify({ memories: [{ content: "test", tags: "t1" }] })),
      isConfigured: mock(() => true),
    };

    const capture = createAutoCapture({
      client,
      store,
      config: makeConfig({ autoCaptureMode: "ai" }),
      logger,
      aiService: mockAiService,
    });

    await capture("ses_mode_ai_1");

    expect(add).toHaveBeenCalledTimes(1);
    expect(add).toHaveBeenCalledWith("test", { tags: "t1", type: "auto" });
  });

  it("AI mode calls aiService.complete with extraction prompt and schema", async () => {
    const { store } = makeStore();
    const client = makeClient([
      { info: { role: "user" }, parts: [{ type: "text", text: "decision architecture" }] },
    ]);
    const mockAiService: AiService = {
      complete: mock(async () => JSON.stringify({ memories: [] })),
      isConfigured: mock(() => true),
    };

    const capture = createAutoCapture({
      client,
      store,
      config: makeConfig({ autoCaptureMode: "ai" }),
      logger,
      aiService: mockAiService,
    });

    await capture("ses_mode_ai_2");

    expect(mockAiService.complete as ReturnType<typeof mock>).toHaveBeenCalledTimes(1);
    const [promptArg, schemaArg] = (mockAiService.complete as ReturnType<typeof mock>).mock.calls[0] as [
      string,
      Record<string, unknown>,
    ];
    expect(promptArg).toBeString();
    expect(promptArg.length).toBeGreaterThan(0);
    expect(schemaArg).toBeDefined();
  });

  it("AI mode logs error and does not store when aiService throws", async () => {
    const { store, add } = makeStore();
    const client = makeClient([
      { info: { role: "user" }, parts: [{ type: "text", text: "decision architecture bug" }] },
    ]);
    const mockAiService: AiService = {
      complete: mock(async () => {
        throw new Error("ai failure");
      }),
      isConfigured: mock(() => true),
    };

    const capture = createAutoCapture({
      client,
      store,
      config: makeConfig({ autoCaptureMode: "ai" }),
      logger,
      aiService: mockAiService,
    });

    await capture("ses_mode_ai_3");
    expect(add).not.toHaveBeenCalled();
    expect(logger.error as ReturnType<typeof mock>).toHaveBeenCalled();
  });

  it("AI mode falls back to heuristic when aiService is missing", async () => {
    const { store, add } = makeStore();
    const client = makeClient([
      { info: { role: "user" }, parts: [{ type: "text", text: "decision architecture bug" }] },
    ]);

    const capture = createAutoCapture({
      client,
      store,
      config: makeConfig({ autoCaptureMode: "ai" }),
      logger,
    });

    await capture("ses_mode_ai_4");

    expect(add).toHaveBeenCalledTimes(1);
    expect(add).toHaveBeenCalledWith("decision architecture bug", {
      tags: "auto-captured",
      type: "auto",
    });
  });

  it("hybrid mode skips ai call when no texts pass threshold", async () => {
    const { store } = makeStore();
    const client = makeClient([{ info: { role: "user" }, parts: [{ type: "text", text: "ok" }] }]);
    const mockAiService: AiService = {
      complete: mock(async () => JSON.stringify({ memories: [] })),
      isConfigured: mock(() => true),
    };

    const capture = createAutoCapture({
      client,
      store,
      config: makeConfig({ autoCaptureMode: "hybrid", autoCaptureMinImportance: 10 }),
      logger,
      aiService: mockAiService,
    });

    await capture("ses_mode_hybrid_1");

    expect(mockAiService.complete as ReturnType<typeof mock>).not.toHaveBeenCalled();
  });

  it("hybrid mode sends only qualifying texts to aiService", async () => {
    const { store } = makeStore();
    const lowText = "ok";
    const highText = "decision architecture bug";
    const client = makeClient([
      { info: { role: "user" }, parts: [{ type: "text", text: lowText }] },
      { info: { role: "user" }, parts: [{ type: "text", text: highText }] },
      { info: { role: "assistant" }, parts: [{ type: "text", text: "response" }] },
    ]);
    const mockAiService: AiService = {
      complete: mock(async () => JSON.stringify({ memories: [] })),
      isConfigured: mock(() => true),
    };

    const capture = createAutoCapture({
      client,
      store,
      config: makeConfig({ autoCaptureMode: "hybrid", autoCaptureMinImportance: 6 }),
      logger,
      aiService: mockAiService,
    });

    await capture("ses_mode_hybrid_2");

    const [promptArg] = (mockAiService.complete as ReturnType<typeof mock>).mock.calls[0] as [string];
    expect(promptArg).toContain(highText);
    expect(promptArg).not.toContain(lowText);
  });

  it("hybrid mode stores ai extracted memories", async () => {
    const { store, add } = makeStore();
    const client = makeClient([
      { info: { role: "user" }, parts: [{ type: "text", text: "decision architecture bug" }] },
    ]);
    const mockAiService: AiService = {
      complete: mock(async () =>
        JSON.stringify({ memories: [{ content: "learned X", tags: "tag1" }] })
      ),
      isConfigured: mock(() => true),
    };

    const capture = createAutoCapture({
      client,
      store,
      config: makeConfig({ autoCaptureMode: "hybrid" }),
      logger,
      aiService: mockAiService,
    });

    await capture("ses_mode_hybrid_3");

    expect(add).toHaveBeenCalledTimes(1);
    expect(add).toHaveBeenCalledWith("learned X", { tags: "tag1", type: "auto" });
  });
});
