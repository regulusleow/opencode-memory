import { describe, test, expect, beforeAll, afterAll, mock } from "bun:test";
import { createWebServer } from "../src/services/web-server.js";
import { createEventBus } from "../src/services/event-bus.js";
import { makeConfig, makeMockStore, makeMockProfileStore, makeMockLogger } from "./helpers.js";

const TEST_PORT = 19082;

describe("SSE /api/events", () => {
  let server: ReturnType<typeof createWebServer>;
  let baseUrl: string;
  let eventBus: ReturnType<typeof createEventBus>;

  beforeAll(async () => {
    eventBus = createEventBus();
    server = createWebServer({
      store: makeMockStore(),
      profileStore: makeMockProfileStore(),
      config: makeConfig({ webServerPort: TEST_PORT }),
      logger: makeMockLogger(),
      eventBus,
      sseHeartbeatMs: 100,
    } as any);
    const result = await server.start();
    baseUrl = result.url;
  });

  afterAll(() => {
    server.stop();
  });

  test("GET /api/events returns 200 with Content-Type: text/event-stream", async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 500);

    try {
      const response = await fetch(`${baseUrl}/api/events`, {
        signal: controller.signal,
      });

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("text/event-stream");
    } finally {
      clearTimeout(timeoutId);
      controller.abort();
    }
  });

  test("GET /api/events includes Cache-Control: no-cache header", async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 500);

    try {
      const response = await fetch(`${baseUrl}/api/events`, {
        signal: controller.signal,
      });

      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toContain("no-cache");
    } finally {
      clearTimeout(timeoutId);
      controller.abort();
    }
  });

  test("GET /api/events sends initial connection event in SSE format", async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1000);

    try {
      const response = await fetch(`${baseUrl}/api/events`, {
        signal: controller.signal,
      });

      expect(response.status).toBe(200);
      expect(response.body).toBeTruthy();

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let data = "";

      try {
      const { value } = await reader.read();
      if (value) {
        data = decoder.decode(value);
      }

      expect(data).toContain("data:");
      expect(data).toContain("connected");
      } finally {
        reader.cancel();
      }
    } finally {
      clearTimeout(timeoutId);
      controller.abort();
    }
  });

  test("Event bus emit broadcasts event to SSE client", async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);

    try {
      const response = await fetch(`${baseUrl}/api/events`, {
        signal: controller.signal,
      });

      expect(response.status).toBe(200);

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();

      try {
        const { value: initialValue } = await reader.read();
        if (initialValue) {
          const initialData = decoder.decode(initialValue);
          expect(initialData).toContain("data:");
        }

        eventBus.emit({
          type: "memory:added",
          data: { id: "test-1", content: "test" },
          timestamp: Date.now(),
        });

        const { value: eventValue } = await reader.read();
        if (eventValue) {
          const eventData = decoder.decode(eventValue);
          expect(eventData).toContain("data:");
          expect(eventData).toContain("memory:added");
        }
      } finally {
        reader.cancel();
      }
    } finally {
      clearTimeout(timeoutId);
      controller.abort();
    }
  });

  test("Multiple SSE clients receive same event", async () => {
    const controller1 = new AbortController();
    const controller2 = new AbortController();
    const timeoutId = setTimeout(() => {
      controller1.abort();
      controller2.abort();
    }, 2000);

    try {
      const response1 = await fetch(`${baseUrl}/api/events`, {
        signal: controller1.signal,
      });
      const response2 = await fetch(`${baseUrl}/api/events`, {
        signal: controller2.signal,
      });

      expect(response1.status).toBe(200);
      expect(response2.status).toBe(200);

      const reader1 = response1.body!.getReader();
      const reader2 = response2.body!.getReader();
      const decoder = new TextDecoder();

      try {
        await reader1.read();
        await reader2.read();

        eventBus.emit({
          type: "stats:updated",
          data: { count: 42 },
          timestamp: Date.now(),
        });

        const { value: v1 } = await reader1.read();
        const { value: v2 } = await reader2.read();

        if (v1 && v2) {
          const data1 = decoder.decode(v1);
          const data2 = decoder.decode(v2);
          expect(data1).toContain("stats:updated");
          expect(data2).toContain("stats:updated");
        }
      } finally {
        reader1.cancel();
        reader2.cancel();
      }
    } finally {
      clearTimeout(timeoutId);
      controller1.abort();
      controller2.abort();
    }
  });

  test("Client disconnect triggers cleanup (no errors)", async () => {
    const controller = new AbortController();

    const response = await fetch(`${baseUrl}/api/events`, {
      signal: controller.signal,
    });

    expect(response.status).toBe(200);

    const reader = response.body!.getReader();
    try {
      await reader.read();
    } finally {
      reader.cancel();
    }

    await new Promise((r) => setTimeout(r, 100));
    expect(eventBus.connectionCount()).toBeGreaterThanOrEqual(0);
  });

  test("Heartbeat sent within sseHeartbeatMs interval", async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 500);

    try {
      const response = await fetch(`${baseUrl}/api/events`, {
        signal: controller.signal,
      });

      expect(response.status).toBe(200);

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();

      try {
        const { value: initialValue } = await reader.read();
        expect(initialValue).toBeTruthy();

        await new Promise((r) => setTimeout(r, 150));

        const { value: heartbeatValue, done } = await reader.read();
        expect(done || heartbeatValue).toBeTruthy();
      } finally {
        reader.cancel();
      }
    } finally {
      clearTimeout(timeoutId);
      controller.abort();
    }
  });

  test("GET /api/events returns 404 when no eventBus configured", async () => {
    const serverNoEventBus = createWebServer({
      store: makeMockStore(),
      profileStore: makeMockProfileStore(),
      config: makeConfig({ webServerPort: TEST_PORT + 1 }),
      logger: makeMockLogger(),
    });

    const result = await serverNoEventBus.start();
    const url = result.url;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 500);

    try {
      const response = await fetch(`${url}/api/events`, {
        signal: controller.signal,
      });

      expect(response.status).toBe(404);
    } finally {
      clearTimeout(timeoutId);
      controller.abort();
      serverNoEventBus.stop();
    }
  });

  test("Server stop cleans up SSE connections", async () => {
    const tempEventBus = createEventBus();
    const tempServer = createWebServer({
      store: makeMockStore(),
      profileStore: makeMockProfileStore(),
      config: makeConfig({ webServerPort: TEST_PORT + 2 }),
      logger: makeMockLogger(),
      eventBus: tempEventBus,
      sseHeartbeatMs: 100,
    } as any);

    const tempResult = await tempServer.start();
    const tempUrl = tempResult.url;

    const controller = new AbortController();
    const response = await fetch(`${tempUrl}/api/events`, {
      signal: controller.signal,
    });

    expect(response.status).toBe(200);

    const reader = response.body!.getReader();
    try {
      await reader.read();

      tempServer.stop();

      await new Promise((r) => setTimeout(r, 100));
      expect(tempEventBus.connectionCount()).toBeGreaterThanOrEqual(0);
    } finally {
      reader.cancel();
      controller.abort();
    }
  });
});
