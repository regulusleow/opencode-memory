import { tool } from "@opencode-ai/plugin";
import type { MemoryStore } from "./memory-store.js";
import type { PluginConfig, MemoryType } from "../types.js";
import type { ProfileStore } from "./profile-store.js";
import {
  formatMemoryContext,
  formatMemoryList,
  formatHelp,
  formatProfileDisplay,
} from "./context.js";

interface ProfileExtractor {
  extract(sessionID: string): Promise<void>;
}

export interface MemoryToolOptions {
  profileStore?: ProfileStore;
  profileExtractor?: ProfileExtractor;
  onWebStart?: () => string;
}

export function createMemoryTool(
  store: MemoryStore,
  config: PluginConfig,
  options?: MemoryToolOptions
) {
  return tool({
    description:
      "Manage and query project memory. Use 'search' with technical keywords/tags, 'add' to store knowledge, 'profile' to view/manage user profile.",
    args: {
      mode: tool.schema
        .enum(["add", "search", "list", "forget", "help", "profile", "web"])
        .optional(),
      content: tool.schema.string().optional(),
      query: tool.schema.string().optional(),
      tags: tool.schema.string().optional(),
      type: tool.schema.string().optional(),
      memoryId: tool.schema.string().optional(),
      limit: tool.schema.number().optional(),
      action: tool.schema.string().optional(),
    },
    async execute(
      args: {
        mode?: "add" | "search" | "list" | "forget" | "help" | "profile" | "web";
        content?: string;
        query?: string;
        tags?: string;
        type?: string;
        memoryId?: string;
        limit?: number;
        action?: string;
      },
      _toolCtx: { sessionID: string }
    ) {
      const mode = args.mode || "help";

      try {
        switch (mode) {
          case "help":
            return formatHelp();

          case "add": {
            if (!args.content) {
              return "Error: content is required for add mode.";
            }
            const memory = await store.add(args.content, {
              tags: args.tags,
              type: (args.type as MemoryType | undefined) || "general",
            });
            return `Memory stored with ID: ${memory.id}`;
          }

          case "search": {
            if (!args.query) {
              return "Error: query is required for search mode.";
            }
            const results = await store.search(args.query, args.limit);
            return formatMemoryContext(results, "search");
          }

          case "list": {
            const memories = await store.list(args.limit);
            return formatMemoryList(memories);
          }

          case "forget": {
            if (!args.memoryId) {
              return "Error: memoryId is required for forget mode.";
            }
            const deleted = await store.forget(args.memoryId);
            if (deleted) {
              return `Memory ${args.memoryId} has been deleted.`;
            }
            return `Memory not found: ${args.memoryId}`;
          }

          case "profile": {
            if (!config.profileEnabled) {
              return "Profile learning is disabled. Enable it by setting profileEnabled: true in your config.";
            }
            const profileStore = options?.profileStore;
            if (!profileStore) {
              return "Profile store not available.";
            }
            const action = args.action ?? "show";
            if (action === "show") {
              const profile = profileStore.getProfile();
              if (!profile) return "No profile available yet. Use mode='profile' action='analyze' to generate one.";
              return formatProfileDisplay(profile);
            }
            if (action === "analyze") {
              const extractor = options?.profileExtractor;
              if (!extractor) return "Profile extractor not available.";
              await extractor.extract(_toolCtx.sessionID);
              const profile = profileStore.getProfile();
              return profile
                ? "Profile updated.\n\n" + formatProfileDisplay(profile)
                : "Analysis complete. Profile will be available on next session.";
            }
            if (action === "delete") {
              const content = args.content ?? "";
              const colonIndex = content.indexOf(":");
              if (colonIndex === -1) {
                return "Invalid delete target. Use: preference:key, pattern:key, or workflow:name";
              }
              const type = content.substring(0, colonIndex);
              const key = content.substring(colonIndex + 1);
              if (type === "preference") return profileStore.deletePreference(key) ? `Deleted preference: ${key}` : `Preference '${key}' not found.`;
              if (type === "pattern") return profileStore.deletePattern(key) ? `Deleted pattern: ${key}` : `Pattern '${key}' not found.`;
              if (type === "workflow") return profileStore.deleteWorkflow(key) ? `Deleted workflow: ${key}` : `Workflow '${key}' not found.`;
              return "Invalid delete target. Use: preference:key, pattern:key, or workflow:name";
            }
            if (action === "reset") {
              profileStore.resetProfile();
              return "Profile reset successfully.";
            }
            return "Unknown action. Use: show, analyze, delete, reset";
          }

          case "web": {
            const onWebStart = options?.onWebStart;
            if (!onWebStart) {
              return "Web UI is not available. Please ensure the plugin is properly configured.";
            }
            const url = onWebStart();
            return `Web UI started at: ${url}`;
          }

          default:
            return `Unknown mode: ${mode}. Use help for usage.`;
        }
      } catch (error) {
        return `Error: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
  });
}
