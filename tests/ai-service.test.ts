import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { createAiService, getPromptResponseText } from "../src/services/ai-service";

type PromptClient = {
  session: {
    prompt: (
      text: string,
      opts?: { format?: { type: string; schema?: unknown } }
    ) => Promise<unknown>;
  };
};

function createMockLogger() {
  return {
    debug: mock(() => {}),
    error: mock(() => {}),
  };
}

describe("getPromptResponseText", () => {
  it("returns string response directly", () => {
    expect(getPromptResponseText("hello")).toBe("hello");
  });

  it("returns text field when response has text", () => {
    expect(getPromptResponseText({ text: "foo" })).toBe("foo");
  });

  it("returns output_text field when response has output_text", () => {
    expect(getPromptResponseText({ output_text: "foo" })).toBe("foo");
  });

  it("throws when response has no text payload", () => {
    expect(() => getPromptResponseText({})).toThrow();
    expect(() => getPromptResponseText(123)).toThrow();
  });
});

describe("AI service host backend", () => {
  it("calls client.session.prompt with prompt only without schema", async () => {
    const promptMock = mock(async () => "host-response");
    const client: PromptClient = {
      session: {
        prompt: promptMock,
      },
    };

    const service = createAiService({
      client,
      config: {},
      logger: createMockLogger(),
    });

    const result = await service.complete("hello");

    expect(result).toBe("host-response");
    expect(promptMock).toHaveBeenCalledTimes(1);
    expect(promptMock).toHaveBeenCalledWith("hello");
  });

  it("passes json_schema format when schema is provided", async () => {
    const promptMock = mock(async () => ({ output_text: "{\"ok\":true}" }));
    const client: PromptClient = {
      session: {
        prompt: promptMock,
      },
    };

    const schema = {
      type: "object",
      properties: {
        ok: { type: "boolean" },
      },
      required: ["ok"],
    };

    const service = createAiService({
      client,
      config: {},
      logger: createMockLogger(),
    });

    const result = await service.complete("extract", schema);

    expect(result).toBe("{\"ok\":true}");
    expect(promptMock).toHaveBeenCalledWith("extract", {
      format: {
        type: "json_schema",
        schema,
      },
    });
  });

  it("isConfigured returns true", () => {
    const promptMock = mock(async () => "ok");
    const service = createAiService({
      client: {
        session: {
          prompt: promptMock,
        },
      },
      config: {},
      logger: createMockLogger(),
    });

    expect(service.isConfigured()).toBe(true);
  });
});

describe("AI service independent backend", () => {
  let originalFetch: typeof globalThis.fetch;
  let originalSetTimeout: typeof globalThis.setTimeout;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    originalSetTimeout = globalThis.setTimeout;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    globalThis.setTimeout = originalSetTimeout;
  });

  it("sends POST to configured URL with auth and body", async () => {
    let capturedRequest: {
      url: string;
      method: string;
      headers: Record<string, string>;
      body: string;
    } | null = null;

    globalThis.fetch = mock(async (url: string | URL | Request, init?: RequestInit) => {
      capturedRequest = {
        url: url.toString(),
        method: init?.method ?? "GET",
        headers: (init?.headers as Record<string, string>) ?? {},
        body: (init?.body as string) ?? "",
      };

      return new Response(
        JSON.stringify({
          choices: [{ message: { content: "api-response" } }],
        })
      );
    }) as unknown as typeof globalThis.fetch;

    const service = createAiService({
      client: {
        session: {
          prompt: mock(async () => "unused"),
        },
      },
      config: {
        aiApiUrl: "https://api.example.com/custom-endpoint",
        aiApiKey: "sk-api-key",
        aiModel: "gpt-4o-mini",
      },
      logger: createMockLogger(),
    });

    const result = await service.complete("hello ai");

    expect(result).toBe("api-response");
    expect(capturedRequest).toBeTruthy();
    expect(capturedRequest!.url).toBe("https://api.example.com/custom-endpoint");
    expect(capturedRequest!.method).toBe("POST");
    expect(capturedRequest!.headers["Content-Type"]).toBe("application/json");
    expect(capturedRequest!.headers["Authorization"]).toBe("Bearer sk-api-key");

    const body = JSON.parse(capturedRequest!.body);
    expect(body).toEqual({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: "hello ai" }],
    });
  });

  it("adds response_format and prompt suffix when schema exists", async () => {
    let capturedBody = "";

    globalThis.fetch = mock(async (_url: string | URL | Request, init?: RequestInit) => {
      capturedBody = (init?.body as string) ?? "";
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: "{\"memories\":[]}" } }],
        })
      );
    }) as unknown as typeof globalThis.fetch;

    const service = createAiService({
      client: {
        session: {
          prompt: mock(async () => "unused"),
        },
      },
      config: {
        aiApiUrl: "https://api.example.com/chat",
        aiApiKey: "sk-api-key",
        aiModel: "gpt-4.1-mini",
      },
      logger: createMockLogger(),
    });

    const schema = {
      type: "object",
      properties: {
        memories: {
          type: "array",
          items: { type: "string" },
        },
      },
      required: ["memories"],
    };

    await service.complete("extract memories", schema);

    const body = JSON.parse(capturedBody);
    expect(body.response_format).toEqual({
      type: "json_schema",
      json_schema: {
        name: "extraction",
        schema,
        strict: true,
      },
    });
    expect(body.messages[0].content).toContain("extract memories");
    expect(body.messages[0].content).toContain(
      "Respond with valid JSON matching this schema. No markdown, no explanation, just JSON."
    );
  });

  it("throws on timeout via AbortController", async () => {
    globalThis.setTimeout = ((fn: TimerHandler, _delay?: number) => {
      return originalSetTimeout(fn, 1);
    }) as typeof globalThis.setTimeout;

    globalThis.fetch = mock((_url: string | URL | Request, init?: RequestInit) => {
      const signal = init?.signal;
      return new Promise<Response>((_resolve, reject) => {
        signal?.addEventListener("abort", () => {
          reject(new DOMException("The operation was aborted.", "AbortError"));
        });
      });
    }) as unknown as typeof globalThis.fetch;

    const service = createAiService({
      client: {
        session: {
          prompt: mock(async () => "unused"),
        },
      },
      config: {
        aiApiUrl: "https://api.example.com/chat",
        aiApiKey: "sk-api-key",
        aiModel: "gpt-timeout",
      },
      logger: createMockLogger(),
    });

    expect(service.complete("timeout me")).rejects.toThrow();
  });
});

describe("createAiService factory", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns host backend when aiApiUrl missing", async () => {
    const promptMock = mock(async () => "host");
    const service = createAiService({
      client: {
        session: {
          prompt: promptMock,
        },
      },
      config: {
        aiApiKey: "sk-set",
      },
      logger: createMockLogger(),
    });

    const result = await service.complete("hello");

    expect(result).toBe("host");
    expect(promptMock).toHaveBeenCalledTimes(1);
  });

  it("returns independent backend when aiApiUrl and aiApiKey are set", async () => {
    const promptMock = mock(async () => "host");
    let fetchCalled = false;

    globalThis.fetch = mock(async () => {
      fetchCalled = true;
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: "independent" } }],
        })
      );
    }) as unknown as typeof globalThis.fetch;

    const service = createAiService({
      client: {
        session: {
          prompt: promptMock,
        },
      },
      config: {
        aiApiUrl: "https://api.example.com/chat",
        aiApiKey: "sk-set",
        aiModel: "gpt-4o-mini",
      },
      logger: createMockLogger(),
    });

    const result = await service.complete("hello");

    expect(result).toBe("independent");
    expect(fetchCalled).toBe(true);
    expect(promptMock).not.toHaveBeenCalled();
  });
});
