import type { PluginConfig } from "../types.js";
import type { Logger } from "./logger.js";

export function createEventHandler(options: {
  needsReinjection: Set<string>;
  onIdle: (sessionID: string) => Promise<void>;
  onIdleProfile?: (sessionID: string) => Promise<void>;
  config: PluginConfig;
  logger: Logger;
}): (input: {
  event: { type: string; properties: { sessionID: string } };
}) => Promise<void> {
  const { needsReinjection, onIdle, onIdleProfile, config, logger } = options;
  const processing = new Map<string, boolean>();

  return async (input) => {
    const { event } = input;

    if (event.type === "session.idle") {
      const { sessionID } = event.properties;
      if (!config.autoCaptureEnabled) return;
      if (processing.get(sessionID)) return;
      processing.set(sessionID, true);
      try {
        await onIdle(sessionID);
      } finally {
        processing.delete(sessionID);
      }
      // Profile extraction after onIdle completes
      if (config.profileEnabled && onIdleProfile) {
        try {
          await onIdleProfile(sessionID);
        } catch (error) {
          logger.error("Profile extraction failed", {
            sessionID,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    } else if (event.type === "session.compacted") {
      const { sessionID } = event.properties;
      needsReinjection.add(sessionID);
      logger.info("Session compacted, flagged for re-injection", {
        sessionID,
      });
    }
  };
}
