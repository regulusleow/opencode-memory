import { readFileSync } from "node:fs";

export function resolveSecret(value: string): string {
  if (value === "") {
    return "";
  }

  if (value.startsWith("file://")) {
    const filePath = value.slice(7);
    try {
      const content = readFileSync(filePath, "utf-8");
      return content.trim();
    } catch (error) {
      throw new Error(`Failed to read secret from file '${filePath}': ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (value.startsWith("env://")) {
    const varName = value.slice(6);
    const envValue = process.env[varName];
    if (envValue === undefined) {
      throw new Error(`Environment variable '${varName}' is not set`);
    }
    return envValue;
  }

  return value;
}
