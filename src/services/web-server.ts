import type { MemoryStore } from "./memory-store.js";
import type { ProfileStore } from "./profile-store.js";
import type { PluginConfig } from "../types.js";
import type { Logger } from "./logger.js";

interface WebServerOptions {
  store: MemoryStore;
  profileStore: ProfileStore;
  config: PluginConfig;
  logger: Logger;
  getHtml?: () => string;
}

interface WebServer {
  start(): { url: string };
  stop(): void;
  isRunning(): boolean;
}

const DEFAULT_HTML =
  "<html><body><h1>opencode-memory Web UI</h1><p>Loading...</p></body></html>";

export function createWebServer(options: WebServerOptions): WebServer {
  const { store, profileStore, config, logger, getHtml } = options;
  let server: ReturnType<typeof Bun.serve> | null = null;
  let running = false;
  let serverUrl = "";

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

  async function handler(req: Request): Promise<Response> {
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

      if (method === "GET" && pathname === "/api/memories") {
        const q = url.searchParams.get("q");
        if (q) {
          const results = await store.search(q);
          return jsonResponse(results);
        }
        const memories = await store.list();
        return jsonResponse(memories);
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

      if (method === "GET" && pathname === "/api/stats") {
        const all = await store.list();
        return jsonResponse({ total: all.length });
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

  return {
    start() {
      if (running && server) {
        return { url: serverUrl };
      }

      server = Bun.serve({
        hostname: "127.0.0.1",
        port: config.webServerPort,
        fetch: handler,
      });

      running = true;
      serverUrl = `http://127.0.0.1:${config.webServerPort}`;
      logger.info("Web server started", { url: serverUrl });
      return { url: serverUrl };
    },

    stop() {
      if (server) {
        server.stop();
        server = null;
        running = false;
        logger.info("Web server stopped");
      }
    },

    isRunning() {
      return running;
    },
  };
}
