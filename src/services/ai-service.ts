import type { AiService } from "../types.js";

const TIMEOUT_MS = 30000;
const JSON_SCHEMA_SUFFIX =
  "\n\nRespond with valid JSON matching this schema. No markdown, no explanation, just JSON.";

interface PromptClient {
  session: {
    prompt(
      text: string,
      opts?: { format?: { type: string; schema?: unknown } }
    ): Promise<unknown>;
  };
}

interface AiConfig {
  aiApiUrl?: string;
  aiApiKey?: string;
  aiModel?: string;
}

interface AiLogger {
  debug(msg: string, ...args: unknown[]): void;
  error(msg: string, ...args: unknown[]): void;
}

export interface CreateAiServiceOptions {
  client: PromptClient;
  config: AiConfig;
  logger: AiLogger;
}

export function getPromptResponseText(response: unknown): string {
  if (typeof response === "string") {
    return response;
  }

  if (response && typeof response === "object") {
    const maybeText = (response as { text?: unknown }).text;
    if (typeof maybeText === "string") {
      return maybeText;
    }

    const maybeOutputText = (response as { output_text?: unknown }).output_text;
    if (typeof maybeOutputText === "string") {
      return maybeOutputText;
    }
  }

  throw new Error("Profile extractor received non-text prompt response");
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function createHostAiBackend(client: PromptClient): AiService {
  return {
    async complete(prompt: string, jsonSchema?: Record<string, unknown>): Promise<string> {
      if (jsonSchema) {
        const response = await client.session.prompt(prompt, {
          format: {
            type: "json_schema",
            schema: jsonSchema,
          },
        });
        return getPromptResponseText(response);
      }

      const response = await client.session.prompt(prompt);
      return getPromptResponseText(response);
    },

    isConfigured(): boolean {
      return true;
    },
  };
}

function createIndependentAiBackend(options: {
  config: AiConfig;
  logger: AiLogger;
}): AiService {
  const { config, logger } = options;
  const apiKey = config.aiApiKey ?? "";
  const aiApiUrl = config.aiApiUrl ?? "";

  return {
    async complete(prompt: string, jsonSchema?: Record<string, unknown>): Promise<string> {
      const promptText = jsonSchema ? `${prompt}${JSON_SCHEMA_SUFFIX}` : prompt;
      const payload: Record<string, unknown> = {
        model: config.aiModel,
        messages: [{ role: "user", content: promptText }],
      };

      if (jsonSchema) {
        payload.response_format = {
          type: "json_schema",
          json_schema: {
            name: "extraction",
            schema: jsonSchema,
            strict: true,
          },
        };
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

      try {
        const response = await fetch(aiApiUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const data = (await response.json()) as {
          choices?: Array<{
            message?: {
              content?: unknown;
            };
          }>;
        };

        const content = data.choices?.[0]?.message?.content;
        if (typeof content !== "string") {
          throw new Error("AI response missing text content");
        }

        return content;
      } catch (error) {
        logger.error("Independent AI completion failed", { error: String(error) });
        throw error;
      } finally {
        clearTimeout(timeoutId);
      }
    },

    isConfigured(): boolean {
      return isNonEmptyString(config.aiApiUrl) && isNonEmptyString(config.aiApiKey);
    },
  };
}

export function createAiService(options: CreateAiServiceOptions): AiService {
  const { client, config, logger } = options;

  if (isNonEmptyString(config.aiApiUrl) && isNonEmptyString(config.aiApiKey)) {
    logger.debug("AI service using independent backend", { aiApiUrl: config.aiApiUrl });
    return createIndependentAiBackend({
      config: {
        aiApiUrl: config.aiApiUrl,
        aiApiKey: config.aiApiKey ?? "",
        aiModel: config.aiModel,
      },
      logger,
    });
  }

  logger.debug("AI service using host backend");
  return createHostAiBackend(client);
}
