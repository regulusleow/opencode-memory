export interface PrivacyFilter {
  filter(content: string): string;
}

function tryCompileRegex(p: string): RegExp | null {
  try {
    return new RegExp(p, "gi");
  } catch {
    return null;
  }
}

export function createPrivacyFilter(patterns: string[]): PrivacyFilter {
  return {
    filter(content: string): string {
      let result = content;

      result = result.replace(/<private>[\s\S]*?<\/private>/gi, "[REDACTED]");

      for (const pattern of patterns) {
        const regex = tryCompileRegex(pattern);
        if (regex === null) continue;
        result = result.replace(regex, "[REDACTED]");
      }

      return result;
    },
  };
}
