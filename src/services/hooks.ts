import type { MemoryStore } from "./memory-store.js";
import type { ProfileStore } from "./profile-store.js";
import type { PluginConfig } from "../types.js";
import { formatMemoryContext, formatProfileContext } from "./context.js";

export const injectedSessions = new Set<string>();
export const needsReinjection = new Set<string>();

export function createChatMessageHook(
  store: MemoryStore,
  config: PluginConfig,
  profileStore?: ProfileStore
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
      if (memories.length > 0) {
        const contextPart = {
          id: `prt-memory-context-${Date.now()}`,
          sessionID: input.sessionID,
          messageID: output.message.id,
          type: "text",
          text: formatMemoryContext(memories, "chat"),
          synthetic: true,
        } as any;

        output.parts.unshift(contextPart);
      }

      if (profileStore && config.profileEnabled) {
        const profile = profileStore.getProfile();
        if (profile) {
          const profileText = formatProfileContext(profile);
          if (profileText) {
            output.parts.unshift({
              id: `prt-profile-context-${Date.now()}`,
              sessionID: input.sessionID,
              messageID: output.message.id,
              type: "text",
              text: profileText,
              synthetic: true,
            });
          }
        }
      }
    } catch {
      // swallow errors silently
    } finally {
      needsReinjection.delete(input.sessionID);
    }
  };
}
