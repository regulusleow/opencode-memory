import type { MemoryStore } from "./memory-store.js";
import type { PluginConfig } from "../types.js";
import { formatMemoryContext } from "./context.js";

// Module-level sets for per-session tracking
export const injectedSessions = new Set<string>();
export const needsReinjection = new Set<string>();

export function createChatMessageHook(
  store: MemoryStore,
  config: PluginConfig
): (
  input: { sessionID: string },
  output: { message: { id: string }; parts: any[] }
) => Promise<void> {
  return async (input, output) => {
    if (injectedSessions.has(input.sessionID) && !needsReinjection.has(input.sessionID)) return;
    injectedSessions.add(input.sessionID);

    try {
      let query = "";
      for (const part of output.parts) {
        if (part.type === "text" && part.text) {
          query = part.text;
          break;
        }
      }

      const memories = await store.search(query, config.contextLimit);
      if (memories.length === 0) return;

      const contextPart = {
        id: `prt-memory-context-${Date.now()}`,
        sessionID: input.sessionID,
        messageID: output.message.id,
        type: "text",
        text: formatMemoryContext(memories, "chat"),
        synthetic: true,
      } as any;

      output.parts.unshift(contextPart);
    } catch {
      // swallow errors silently
    } finally {
      needsReinjection.delete(input.sessionID);
    }
  };
}
