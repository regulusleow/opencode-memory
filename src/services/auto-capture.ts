import type { AiExtractionResult, AiService, PluginConfig } from "../types.js";
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

export function getExtractionPrompt(texts: string[]): string {
  const promptLines = texts.map((text, index) => `${index + 1}. ${text}`);
  return [
    "You are a memory extraction engine for a coding assistant.",
    "Analyze the conversation texts and extract structured memories.",
    "Identify key decisions, lessons learned, important facts, and user preferences.",
    "Skip trivial or routine messages that are not useful for future context.",
    "Return valid JSON with a memories array.",
    "Each memory entry must include:",
    "- content: concise summary",
    "- tags: comma-separated relevant tags",
    "Limit output to a maximum of 5 entries.",
    "",
    "Conversation Texts:",
    ...promptLines,
  ].join("\n");
}

export function getExtractionSchema(): Record<string, unknown> {
  return {
    type: "object",
    properties: {
      memories: {
        type: "array",
        items: {
          type: "object",
          properties: {
            content: { type: "string" },
            tags: { type: "string" },
          },
          required: ["content", "tags"],
        },
      },
    },
    required: ["memories"],
  };
}

export function parseExtractionResponse(raw: string): AiExtractionResult {
  try {
    const parsed = JSON.parse(raw) as { memories?: unknown };
    if (!Array.isArray(parsed.memories)) {
      return { memories: [] };
    }

    const memories = parsed.memories
      .filter((item): item is Record<string, unknown> => item !== null && typeof item === "object")
      .map((item) => ({
        content: typeof item.content === "string" ? item.content : "",
        tags: typeof item.tags === "string" ? item.tags : "",
      }))
      .filter((item) => item.content.trim().length > 0 && item.tags.trim().length > 0);

    return { memories };
  } catch {
    return { memories: [] };
  }
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
  aiService?: AiService;
}): (sessionID: string) => Promise<void> {
  const { client, store, config, logger, aiService } = options;

  const getTextParts = (messages: Array<{ info: any; parts: any[] }>): string[] => {
    return messages.flatMap((message) =>
      message.parts
        .filter((part) => part.type === "text" && typeof part.text === "string")
        .map((part) => part.text as string)
    );
  };

  const runHeuristic = async (texts: string[]): Promise<void> => {
    const scoredTexts: Array<{ text: string; score: number }> = [];

    for (const text of texts) {
      const score = scoreImportance(text);
      if (score >= config.autoCaptureMinImportance) {
        scoredTexts.push({ text, score });
      }
    }

    scoredTexts.sort((a, b) => b.score - a.score);
    const selected = scoredTexts.slice(0, 3);

    for (const item of selected) {
      await store.add(item.text, { tags: "auto-captured", type: "auto" });
    }
  };

  const runAi = async (service: AiService, texts: string[]): Promise<void> => {
    const raw = await service.complete(getExtractionPrompt(texts), getExtractionSchema());
    const extracted = parseExtractionResponse(raw);
    for (const memory of extracted.memories) {
      await store.add(memory.content, { tags: memory.tags, type: "auto" });
    }
  };

  return async (sessionID: string) => {
    try {
      await new Promise((resolve) => setTimeout(resolve, config.autoCaptureDelay));

      const messages = await client.session.messages({ path: { id: sessionID } });

      if (config.autoCaptureMode === "heuristic") {
        await runHeuristic(getTextParts(messages));
        return;
      }

      if (!aiService) {
        logger.warn("AI service missing, falling back to heuristic auto-capture", { sessionID });
        await runHeuristic(getTextParts(messages));
        return;
      }

      if (config.autoCaptureMode === "ai") {
        try {
          await runAi(aiService, getTextParts(messages));
        } catch (error) {
          logger.error("AI auto-capture failed", { sessionID, error: String(error) });
        }
        return;
      }

      const qualifyingTexts = getTextParts(messages).filter(
        (text) => scoreImportance(text) >= config.autoCaptureMinImportance
      );
      if (qualifyingTexts.length === 0) {
        return;
      }

      try {
        await runAi(aiService, qualifyingTexts);
      } catch (error) {
        logger.error("Hybrid auto-capture AI step failed", { sessionID, error: String(error) });
      }
    } catch (error) {
      logger.error("Auto-capture failed", { sessionID, error: String(error) });
    }
  };
}
