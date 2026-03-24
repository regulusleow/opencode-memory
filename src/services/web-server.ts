import type { MemoryStore } from "./memory-store.js";
import type { ProfileStore } from "./profile-store.js";
import type { PluginConfig, ExportData, EventBus } from "../types.js";
import type { Logger } from "./logger.js";

interface WebServerOptions {
  store: MemoryStore;
  profileStore: ProfileStore;
  config: PluginConfig;
  logger: Logger;
  getHtml?: () => string;
  eventBus?: EventBus;
  sseHeartbeatMs?: number;
}

export interface WebServer {
  start(): Promise<{ url: string }>;
  stop(): void;
  isRunning(): boolean;
  getUrl(): string;
}

const DEFAULT_HTML =
  "<html><body><h1>opencode-memory Web UI</h1><p>Loading...</p></body></html>";

const HEALTH_CHECK_INTERVAL_MS = 5000;
const TAKEOVER_JITTER_MIN_MS = 500;
const TAKEOVER_JITTER_MAX_MS = 1500;

export function createWebServer(options: WebServerOptions): WebServer {
  const { store, profileStore, config, logger, getHtml, eventBus, sseHeartbeatMs = 30000 } = options;
  let server: ReturnType<typeof Bun.serve> | null = null;
  let isOwner = false;
  let stopped = false;
  let serverUrl = `http://127.0.0.1:${config.webServerPort}`;
  let healthCheckTimer: ReturnType<typeof setInterval> | null = null;
  let startInFlight: Promise<{ url: string }> | null = null;
  const activeCleanups = new Set<() => void>();

  const corsHeaders: Record<string, string> = {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json",
  };

  function jsonResponse(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), {
      status,
      headers: corsHeaders,
    });
  }

  function sseResponse(): Response {
    if (!eventBus) {
      return jsonResponse({ error: "Not found" }, 404);
    }

    let unsubscribe: () => void;
    let heartbeatTimer: ReturnType<typeof setInterval>;

    const cleanup = () => {
      clearInterval(heartbeatTimer);
      unsubscribe?.();
      activeCleanups.delete(cleanup);
    };
    activeCleanups.add(cleanup);

    const stream = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();

        function enqueue(data: string) {
          try {
            controller.enqueue(encoder.encode(data));
          } catch {
            // intentionally empty: client disconnected
          }
        }

        enqueue(`data: ${JSON.stringify({ type: "connected", timestamp: Date.now() })}\n\n`);

        unsubscribe = eventBus.on((event) => {
          enqueue(`data: ${JSON.stringify(event)}\n\n`);
        });

        heartbeatTimer = setInterval(() => {
          enqueue(`: heartbeat\n\n`);
        }, sseHeartbeatMs);
      },
      cancel() {
        cleanup();
      },
    });

    return new Response(stream, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }

  async function handler(req: Request, _srv?: unknown): Promise<Response> {
    const url = new URL(req.url);
    const { pathname } = url;
    const method = req.method;

    try {
      if (method === "GET" && pathname === "/") {
        const html = getHtml ? getHtml() : DEFAULT_HTML;
        return new Response(html, {
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Access-Control-Allow-Origin": "*",
          },
        });
      }

      if (method === "GET" && pathname === "/api/events") {
        return sseResponse();
      }

      if (method === "GET" && pathname === "/api/memories") {
        const q = url.searchParams.get("q");
        if (q) {
          const results = await store.search(q);
          return jsonResponse({ memories: results, total: results.length, page: 1, totalPages: 1 });
        }
        const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
        const limit = Math.max(1, Math.min(100, parseInt(url.searchParams.get("limit") ?? "20", 10)));
        const offset = (page - 1) * limit;
        const [memories, stats] = await Promise.all([store.list(limit, offset), store.getStats()]);
        const total = stats.total;
        const totalPages = Math.max(1, Math.ceil(total / limit));
        return jsonResponse({ memories, total, page, totalPages });
      }

      const deleteMatch = pathname.match(/^\/api\/memories\/(.+)$/);
      if (method === "DELETE" && deleteMatch) {
        const id = deleteMatch[1];
        const success = await store.forget(id);
        if (!success) {
          return jsonResponse({ error: "Not found" }, 404);
        }
        return jsonResponse({ success: true });
      }

      if (method === "GET" && pathname === "/api/export") {
        const exportData = await store.exportAll();
        return jsonResponse(exportData);
      }

      if (method === "POST" && pathname === "/api/import") {
        let body: unknown;
        try {
          body = await req.json();
        } catch {
          return jsonResponse({ error: "invalid JSON" }, 400);
        }

        if (!body || typeof body !== "object" || !("schemaVersion" in body)) {
          return jsonResponse({ error: "invalid import data: missing schemaVersion" }, 400);
        }

        const result = await store.importMemories(body as ExportData);
        return jsonResponse(result);
      }

      if (method === "GET" && pathname === "/api/stats") {
        const stats = await store.getStats();
        return jsonResponse(stats);
      }

      if (method === "GET" && pathname === "/api/profile") {
        const profile = profileStore.getProfile();
        return jsonResponse(profile);
      }

      return jsonResponse({ error: "Not found" }, 404);
    } catch (err) {
      logger.error("Web server request error", {
        path: pathname,
        error: String(err),
      });
      return jsonResponse({ error: "Internal server error" }, 500);
    }
  }

  async function checkServerAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${serverUrl}/api/stats`, {
        method: "GET",
        signal: AbortSignal.timeout(2000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  function stopHealthCheck(): void {
    if (healthCheckTimer) {
      clearInterval(healthCheckTimer);
      healthCheckTimer = null;
    }
  }

  function startHealthCheck(): void {
    if (healthCheckTimer) return;

    healthCheckTimer = setInterval(async () => {
      if (stopped) return;
      const available = await checkServerAvailable();
      if (stopped) return;
      if (!available) {
        stopHealthCheck();
        await attemptTakeover();
      }
    }, HEALTH_CHECK_INTERVAL_MS);
  }

  async function attemptTakeover(): Promise<void> {
    if (stopped) return;

    // random jitter to prevent thundering herd when multiple non-owners race
    const jitter = TAKEOVER_JITTER_MIN_MS + Math.random() * (TAKEOVER_JITTER_MAX_MS - TAKEOVER_JITTER_MIN_MS);
    await new Promise((resolve) => setTimeout(resolve, jitter));

    if (stopped) return;

    // re-check after jitter: another process may have already taken over
    if (await checkServerAvailable()) {
      if (!stopped) startHealthCheck();
      return;
    }

    if (stopped) return;

    try {
      await _start();
      if (isOwner) {
        logger.info("Web server takeover successful", { url: serverUrl });
      }
    } catch (error) {
      logger.error("Web server takeover failed", { error: String(error) });
      if (!stopped) startHealthCheck();
    }
  }

  async function _start(): Promise<{ url: string }> {
    if (isOwner && server) {
      return { url: serverUrl };
    }

    try {
      server = Bun.serve({
        hostname: "127.0.0.1",
        port: config.webServerPort,
        fetch: (req, srv) => handler(req, srv),
      });
      isOwner = true;
      serverUrl = `http://127.0.0.1:${server.port}`;
      logger.info("Web server started", { url: serverUrl });
      return { url: serverUrl };
    } catch (error) {
      const errorMsg = String(error);
      const isPortConflict =
        errorMsg.includes("EADDRINUSE") ||
        errorMsg.includes("address already in use") ||
        /Failed to start server.*Is port \d+ in use/.test(errorMsg);

      if (isPortConflict) {
        isOwner = false;
        server = null;
        logger.info("Web server port already in use, entering standby mode", {
          port: config.webServerPort,
        });
        startHealthCheck();
        return { url: serverUrl };
      }

      throw error;
    }
  }

  return {
    async start(): Promise<{ url: string }> {
      if (stopped) return { url: serverUrl };
      if (isOwner && server) return { url: serverUrl };
      if (startInFlight) return startInFlight;
      startInFlight = _start().finally(() => { startInFlight = null; });
      return startInFlight;
    },

    stop() {
      stopped = true;
      stopHealthCheck();
      startInFlight = null;
      for (const cleanup of activeCleanups) {
        cleanup();
      }
      activeCleanups.clear();
      if (server) {
        server.stop();
        server = null;
        isOwner = false;
        logger.info("Web server stopped");
      }
    },

    isRunning() {
      return isOwner && server !== null;
    },

    getUrl() {
      return serverUrl;
    },
  };
}
