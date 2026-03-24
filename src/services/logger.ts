import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { expandPath } from "../config.js";

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
  options?: { storagePath?: string; logLevel?: LogLevel }
): Logger {
  const resolvedPath = options?.storagePath ?? expandPath("~/.opencode-memory");
  const logsDir = join(resolvedPath, "logs");
  const configuredLevel = LOG_LEVELS[options?.logLevel ?? "debug"];

  function _log(
    level: "debug" | "info" | "warn" | "error",
    message: string,
    extra?: Record<string, unknown>
  ): void {
    if (LOG_LEVELS[level] < configuredLevel) return;

    try {
      mkdirSync(logsDir, { recursive: true });
    } catch {
      // silent - logger must never throw
    }

    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    const timeStr = now.toISOString().slice(11, 19);
    const timestamp = `${dateStr} ${timeStr}`;
    const levelTag = level.toUpperCase();

    let line = `[${timestamp}] [${levelTag}] ${message}`;
    if (extra !== undefined) {
      line += ` ${JSON.stringify(extra)}`;
    }
    line += "\n";

    try {
      appendFileSync(join(logsDir, `${dateStr}.log`), line);
    } catch {
      // silent - logger must never throw
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
