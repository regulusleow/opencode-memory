import type { PluginConfig } from "../types.js";
import type { Logger } from "./logger.js";
import type { MemoryStore } from "./memory-store.js";

export function scoreImportance(text: string): number {
  let score = 5;
  const keywords = [
    "决定",
    "decision",
    "选择",
    "approach",
    "architecture",
    "bug",
    "fix",
    "lesson",
    "注意",
    "important",
    "remember",
  ];

  for (const keyword of keywords) {
    if (text.toLowerCase().includes(keyword)) {
      score += 2;
    }
  }

  if (text.length > 200) {
    score += 1;
  }

  if (text.includes("```")) {
    score += 1;
  }

  return score;
}

export function createAutoCapture(options: {
  client: {
    session: {
      messages: (args: { path: { id: string } }) => Promise<Array<{ info: any; parts: any[] }>>;
    };
  };
  store: MemoryStore;
  config: PluginConfig;
  logger: Logger;
}): (sessionID: string) => Promise<void> {
  const { client, store, config, logger } = options;

  return async (sessionID: string) => {
    try {
      await new Promise((resolve) => setTimeout(resolve, config.autoCaptureDelay));

      const messages = await client.session.messages({ path: { id: sessionID } });
      const scoredTexts: Array<{ text: string; score: number }> = [];

      for (const message of messages) {
        const textParts = message.parts
          .filter((part) => part.type === "text" && typeof part.text === "string")
          .map((part) => part.text as string);

        for (const text of textParts) {
          const score = scoreImportance(text);
          if (score >= config.autoCaptureMinImportance) {
            scoredTexts.push({ text, score });
          }
        }
      }

      scoredTexts.sort((a, b) => b.score - a.score);
      const selected = scoredTexts.slice(0, 3);

      for (const item of selected) {
        await store.add(item.text, { tags: "auto-captured", type: "auto" });
      }
    } catch (error) {
      logger.error("Auto-capture failed", { sessionID, error: String(error) });
    }
  };
}
