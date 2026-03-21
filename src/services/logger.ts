import type { OpencodeClient } from "@opencode-ai/sdk";

export interface Logger {
  debug(message: string, extra?: Record<string, unknown>): void;
  info(message: string, extra?: Record<string, unknown>): void;
  warn(message: string, extra?: Record<string, unknown>): void;
  error(message: string, extra?: Record<string, unknown>): void;
}

type LogLevel = "debug" | "info" | "warn" | "error" | "silent";

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  silent: 4,
};

export function createLogger(
  client: OpencodeClient | null,
  options?: { logLevel?: LogLevel }
): Logger {
  const configuredLevel = LOG_LEVELS[options?.logLevel ?? "debug"];

  function _log(
    level: "debug" | "info" | "warn" | "error",
    message: string,
    extra?: Record<string, unknown>
  ): void {
    if (LOG_LEVELS[level] < configuredLevel) return;

    if (client) {
      client.app
        .log({
          body: {
            service: "opencode-memory",
            level,
            message,
            extra,
          },
        })
        .catch(() => {});
    } else {
      if (extra !== undefined) {
        console[level]("[opencode-memory]", message, extra);
      } else {
        console[level]("[opencode-memory]", message);
      }
    }
  }

  return {
    debug: (message: string, extra?: Record<string, unknown>) =>
      _log("debug", message, extra),
    info: (message: string, extra?: Record<string, unknown>) =>
      _log("info", message, extra),
    warn: (message: string, extra?: Record<string, unknown>) =>
      _log("warn", message, extra),
    error: (message: string, extra?: Record<string, unknown>) =>
      _log("error", message, extra),
  };
}
