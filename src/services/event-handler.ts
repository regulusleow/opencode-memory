import type { PluginConfig } from "../types.js";
import type { Logger } from "./logger.js";

export function createEventHandler(options: {
  needsReinjection: Set<string>;
  onIdle: (sessionID: string) => Promise<void>;
  onIdleProfile?: (sessionID: string) => Promise<void>;
  onIdleSummary?: (sessionID: string) => Promise<void>;
  config: PluginConfig;
  logger: Logger;
}): (input: {
  event: { type: string; properties: { sessionID: string } };
}) => Promise<void> {
  const { needsReinjection, onIdle, onIdleProfile, onIdleSummary, config, logger } = options;
  const processing = new Map<string, boolean>();

  return async (input) => {
    const { event } = input;

    if (event.type === "session.idle") {
      const { sessionID } = event.properties;
      const shouldCapture = config.autoCaptureEnabled;
      const shouldExtractProfile = config.profileEnabled && !!onIdleProfile;

      if (!shouldCapture && !shouldExtractProfile && !onIdleSummary) return;
      if (processing.get(sessionID)) return;
      processing.set(sessionID, true);
      try {
        if (shouldCapture) {
          await onIdle(sessionID);
        }
        if (shouldExtractProfile) {
          try {
            await onIdleProfile!(sessionID);
          } catch (error) {
            logger.error("Profile extraction failed", {
              sessionID,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }
        if (onIdleSummary) {
          try {
            await onIdleSummary(sessionID);
          } catch (error) {
            logger.debug("Session summary generation failed", {
              sessionID,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }
      } finally {
        processing.delete(sessionID);
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
