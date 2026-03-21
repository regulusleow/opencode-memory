export interface Logger {
  debug(message: string, extra?: Record<string, unknown>): void;
  info(message: string, extra?: Record<string, unknown>): void;
  warn(message: string, extra?: Record<string, unknown>): void;
  error(message: string, extra?: Record<string, unknown>): void;
}

export function createLogger(client: any | null): Logger {
  return {
    debug(message: string, extra?: Record<string, unknown>): void {
      if (!client) return;
      client.app
        .log({
          body: {
            service: "opencode-memory",
            level: "debug",
            message,
            extra,
          },
        })
        .catch(() => {});
    },
    info(message: string, extra?: Record<string, unknown>): void {
      if (!client) return;
      client.app
        .log({
          body: {
            service: "opencode-memory",
            level: "info",
            message,
            extra,
          },
        })
        .catch(() => {});
    },
    warn(message: string, extra?: Record<string, unknown>): void {
      if (!client) return;
      client.app
        .log({
          body: {
            service: "opencode-memory",
            level: "warn",
            message,
            extra,
          },
        })
        .catch(() => {});
    },
    error(message: string, extra?: Record<string, unknown>): void {
      if (!client) return;
      client.app
        .log({
          body: {
            service: "opencode-memory",
            level: "error",
            message,
            extra,
          },
        })
        .catch(() => {});
    },
  };
}
