import { tool } from "@opencode-ai/plugin";
import type { MemoryStore } from "./memory-store.js";
import type { PluginConfig } from "../types.js";
import {
  formatMemoryContext,
  formatMemoryList,
  formatHelp,
} from "./context.js";

export function createMemoryTool(store: MemoryStore, config: PluginConfig) {
  return tool({
    description:
      "Manage and query project memory. Use 'search' with technical keywords/tags, 'add' to store knowledge.",
    args: {
      mode: tool.schema
        .enum(["add", "search", "list", "forget", "help"])
        .optional(),
      content: tool.schema.string().optional(),
      query: tool.schema.string().optional(),
      tags: tool.schema.string().optional(),
      type: tool.schema.string().optional(),
      memoryId: tool.schema.string().optional(),
      limit: tool.schema.number().optional(),
    },
    async execute(
      args: {
        mode?: "add" | "search" | "list" | "forget" | "help";
        content?: string;
        query?: string;
        tags?: string;
        type?: string;
        memoryId?: string;
        limit?: number;
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
              type: args.type,
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

          default:
            return `Unknown mode: ${mode}. Use help for usage.`;
        }
      } catch (error) {
        return `Error: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
  });
}
