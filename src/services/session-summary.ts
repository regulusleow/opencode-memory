import type { AiService, PluginConfig } from "../types.js";
import type { MemoryStore } from "./memory-store.js";
import type { Logger } from "./logger.js";

interface SessionSummaryOptions {
  aiService: AiService;
  store: MemoryStore;
  config: PluginConfig;
  logger: Logger;
  minMessages?: number;
}

interface SessionSummaryService {
  generateSummary(sessionId: string, messages: Array<{ role: string; content: string; id?: string }>): Promise<string | null>;
  storeSummary(sessionId: string, summary: string): Promise<void>;
}

export function createSessionSummary(options: SessionSummaryOptions): SessionSummaryService {
  const { aiService, store, config, logger, minMessages = 5 } = options;

  return {
    async generateSummary(sessionId, messages) {
      if (!aiService.isConfigured()) {
        return null;
      }

      if (messages.length < minMessages) {
        return null;
      }

      const truncated = messages.slice(-config.profileMaxMessagesPerExtraction);
      const transcript = truncated
        .map((m) => `${m.role}: ${m.content}`)
        .join("\n");

      const prompt = `Summarize the key topics, decisions, and outcomes from this conversation session (ID: ${sessionId}):\n\n${transcript}\n\nProvide a concise summary in 2-4 sentences.`;

      return await aiService.complete(prompt);
    },

    async storeSummary(sessionId, summary) {
      await store.add(summary, {
        type: "session-summary",
        tags: sessionId,
        metadata: { sessionId },
      });
    },
  };
}
