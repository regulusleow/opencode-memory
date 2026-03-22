import { tool } from "@opencode-ai/plugin";
import type { MemoryStore } from "./memory-store.js";
import type { PluginConfig, MemoryType, MemoryStats, ExportData } from "../types.js";
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

function formatStats(stats: MemoryStats): string {
  const lines = [
    `Memory Stats:`,
    `  Total: ${stats.total}`,
    `  By Type:`,
    ...Object.entries(stats.byType).map(([type, count]) => `    ${type}: ${count}`),
    `  By Status:`,
    ...Object.entries(stats.byEmbeddingStatus).map(([status, count]) => `    ${status}: ${count}`),
  ];
  
  if (stats.oldest !== null && stats.oldest !== undefined) {
    const oldestVal = stats.oldest as any;
    const oldestTime = typeof oldestVal === 'number' ? oldestVal : (oldestVal.createdAt ?? oldestVal);
    if (oldestTime) {
      lines.push(`  Oldest: ${new Date(oldestTime).toISOString()}`);
    }
  }
  
  if (stats.newest !== null && stats.newest !== undefined) {
    const newestVal = stats.newest as any;
    const newestTime = typeof newestVal === 'number' ? newestVal : (newestVal.createdAt ?? newestVal);
    if (newestTime) {
      lines.push(`  Newest: ${new Date(newestTime).toISOString()}`);
    }
  }
  
  return lines.join("\n");
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
        .enum(["add", "search", "list", "forget", "help", "profile", "web", "stats", "export"])
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
        mode?: "add" | "search" | "list" | "forget" | "help" | "profile" | "web" | "stats" | "export";
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
            
            const VALID_TYPES = ["general", "decision", "preference", "lesson", "code-pattern", "bug-fix", "auto"] as const;
            if (args.type && !VALID_TYPES.includes(args.type as any)) {
              return `Error: invalid type '${args.type}'. Valid types: ${VALID_TYPES.join(", ")}`;
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
            const ids = results.map(m => m.id);
            if (ids.length > 0) {
              await (store as any).recordSearchHit(ids);
            }
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

           case "stats": {
             const stats = await (store as any).getStats();
             return formatStats(stats);
           }

           case "export": {
             const exportData = await (store as any).exportAll();
             return JSON.stringify(exportData);
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
