import type { AiService, ProfilePattern, ProfilePreference, ProfileWorkflow, PluginConfig } from "../types.js";
import type { Logger } from "./logger.js";
import type { ProfileStore } from "./profile-store.js";

interface SessionMessagePart {
  type?: string;
  text?: unknown;
}

interface SessionMessage {
  info?: {
    role?: string;
  };
  parts?: SessionMessagePart[];
}

export interface ProfileClient {
  session: {
    messages: (args: { path: { id: string } }) => Promise<SessionMessage[]>;
  };
}

interface ExtractedProfile {
  preferences: ProfilePreference[];
  patterns: ProfilePattern[];
  workflows: ProfileWorkflow[];
}

export interface ProfileExtractor {
  extract(sessionID: string): Promise<void>;
}

export function createProfileExtractor(options: {
  client: ProfileClient;
  aiService: AiService;
  profileStore: ProfileStore;
  config: PluginConfig;
  logger: Logger;
}): ProfileExtractor {
  const { client, aiService, profileStore, config, logger } = options;

  async function extract(sessionID: string): Promise<void> {
    try {
      const messages = await client.session.messages({ path: { id: sessionID } });
      const userTexts = messages
        .filter((message) => message.info?.role === "user")
        .map((message) => getTextFromParts(message.parts ?? []))
        .filter((text) => text.length > 0);

      const limitedTexts = userTexts.slice(-config.profileMaxMessagesPerExtraction);
      if (limitedTexts.length < config.profileExtractionMinPrompts) {
        return;
      }

      const promptText = getAnalysisPrompt(limitedTexts);
      const raw = await aiService.complete(promptText, getJsonSchema());

      const extracted = parseExtractionResponse(raw);
      profileStore.mergeProfile(extracted);
    } catch (error) {
      logger.error("Profile extraction failed", {
        sessionID,
        error: String(error),
      });
    }
  }

  return { extract };
}

function getTextFromParts(parts: SessionMessagePart[]): string {
  return parts
    .filter((part) => part.type === "text" && typeof part.text === "string")
    .map((part) => part.text as string)
    .join("\n")
    .trim();
}

function parseExtractionResponse(raw: string): ExtractedProfile {
  const parsed = JSON.parse(raw) as {
    preferences?: unknown;
    patterns?: unknown;
    workflows?: unknown;
  };

  return {
    preferences: parsePreferences(parsed.preferences),
    patterns: parsePatterns(parsed.patterns),
    workflows: parseWorkflows(parsed.workflows),
  };
}

function parsePreferences(input: unknown): ProfilePreference[] {
  if (!Array.isArray(input)) return [];
  const now = Date.now();
  return input
    .filter((item): item is Record<string, unknown> => item !== null && typeof item === "object")
    .map((item) => ({
      key: typeof item.key === "string" ? item.key : "",
      value: typeof item.value === "string" ? item.value : "",
      confidence: typeof item.confidence === "number" ? item.confidence : 0,
      evidence: Array.isArray(item.evidence)
        ? item.evidence.filter((value): value is string => typeof value === "string")
        : [],
      updatedAt: typeof item.updatedAt === "number" ? item.updatedAt : now,
    }))
    .filter((item) => item.key.length > 0 && item.value.length > 0);
}

function parsePatterns(input: unknown): ProfilePattern[] {
  if (!Array.isArray(input)) return [];
  const now = Date.now();
  return input
    .filter((item): item is Record<string, unknown> => item !== null && typeof item === "object")
    .map((item) => ({
      key: typeof item.key === "string" ? item.key : "",
      description: typeof item.description === "string" ? item.description : "",
      frequency: typeof item.frequency === "number" ? item.frequency : 1,
      lastSeen: typeof item.lastSeen === "number" ? item.lastSeen : now,
    }))
    .filter((item) => item.key.length > 0 && item.description.length > 0);
}

function parseWorkflows(input: unknown): ProfileWorkflow[] {
  if (!Array.isArray(input)) return [];
  const now = Date.now();
  return input
    .filter((item): item is Record<string, unknown> => item !== null && typeof item === "object")
    .map((item) => ({
      name: typeof item.name === "string" ? item.name : "",
      steps: Array.isArray(item.steps)
        ? item.steps.filter((value): value is string => typeof value === "string")
        : [],
      frequency: typeof item.frequency === "number" ? item.frequency : 1,
      lastSeen: typeof item.lastSeen === "number" ? item.lastSeen : now,
    }))
    .filter((item) => item.name.length > 0);
}

function getAnalysisPrompt(messages: string[]): string {
  const promptLines = messages.map((message, index) => `${index + 1}. ${message}`);
  return [
    "You are a profile extraction engine for a coding assistant.",
    "Analyze ONLY user messages and infer profile data.",
    "Return valid JSON that strictly matches the required schema.",
    "",
    "Rules:",
    "- preferences: stable user preferences and constraints",
    "- patterns: recurring technical themes with frequency",
    "- workflows: repeated process habits as ordered steps",
    "- confidence must be in [0,1]",
    "",
    "User Messages:",
    ...promptLines,
  ].join("\n");
}

function getJsonSchema(): Record<string, unknown> {
  return {
    type: "object",
    properties: {
      preferences: {
        type: "array",
        items: {
          type: "object",
          properties: {
            key: { type: "string" },
            value: { type: "string" },
            confidence: { type: "number" },
            evidence: { type: "array", items: { type: "string" } },
            updatedAt: { type: "number" },
          },
          required: ["key", "value", "confidence", "evidence", "updatedAt"],
        },
      },
      patterns: {
        type: "array",
        items: {
          type: "object",
          properties: {
            key: { type: "string" },
            description: { type: "string" },
            frequency: { type: "number" },
            lastSeen: { type: "number" },
          },
          required: ["key", "description", "frequency", "lastSeen"],
        },
      },
      workflows: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            steps: { type: "array", items: { type: "string" } },
            frequency: { type: "number" },
            lastSeen: { type: "number" },
          },
          required: ["name", "steps", "frequency", "lastSeen"],
        },
      },
    },
    required: ["preferences", "patterns", "workflows"],
  };
}
