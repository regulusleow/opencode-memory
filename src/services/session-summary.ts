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

      const prompt = [
        `Analyze this conversation session (ID: ${sessionId}) and produce a concise summary focused on reusable knowledge.`,
        "",
        "Include:",
        "- Technical findings: API behaviors, library quirks, error root causes, compatibility issues discovered",
        "- Decisions made and the rationale behind them",
        "- Concrete solutions or fixes applied",
        "",
        "Exclude:",
        "- What the user asked or tried (narrative)",
        "- Status updates or progress descriptions",
        "- Anything that is not actionable in a future session",
        "",
        "Write in declarative statements, not past-tense narrative.",
        "Bad: 'The user fixed a bug by removing response_format'",
        "Good: 'DeepSeek API rejects requests with response_format json_schema; use prompt-level instructions instead'",
        "",
        "Conversation:",
        transcript,
        "",
        "Summary (2-4 sentences, declarative facts and conclusions):",
      ].join("\n");

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
