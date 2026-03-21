import { describe, it, expect } from "bun:test";
import { createPrivacyFilter } from "../src/services/privacy";

describe("Privacy Filter", () => {
  it("removes <private> tags with simple content", () => {
    const filter = createPrivacyFilter([]);
    const result = filter.filter("This is <private>secret</private> text");
    expect(result).toBe("This is [REDACTED] text");
  });

  it("removes multiple <private> tags", () => {
    const filter = createPrivacyFilter([]);
    const input = "public <private>a</private> mid <private>b</private> end";
    const result = filter.filter(input);
    expect(result).toBe("public [REDACTED] mid [REDACTED] end");
  });

  it("handles multi-line content in <private> tags", () => {
    const filter = createPrivacyFilter([]);
    const input = "<private>line1\nline2\nline3</private>";
    const result = filter.filter(input);
    expect(result).toBe("[REDACTED]");
  });

  it("returns original text when no <private> tags present", () => {
    const filter = createPrivacyFilter([]);
    const input = "This is normal text without any tags";
    const result = filter.filter(input);
    expect(result).toBe(input);
  });

  it("handles empty string", () => {
    const filter = createPrivacyFilter([]);
    const result = filter.filter("");
    expect(result).toBe("");
  });

  it("filters custom regex pattern (OpenAI key format)", () => {
    const filter = createPrivacyFilter(["sk-[a-zA-Z0-9]{20,}"]);
    const input = "My API key is sk-proj123456789012345678901 in production";
    const result = filter.filter(input);
    expect(result).toBe("My API key is [REDACTED] in production");
  });

  it("handles empty patterns array (only <private> tag filtering)", () => {
    const filter = createPrivacyFilter([]);
    const input = "<private>secret</private> and normal text";
    const result = filter.filter(input);
    expect(result).toBe("[REDACTED] and normal text");
  });

  it("gracefully skips invalid regex patterns without throwing", () => {
    const filter = createPrivacyFilter(["[invalid regex"]);
    const input = "some <private>content</private> here";
    const result = filter.filter(input);
    expect(result).toBe("some [REDACTED] here");
  });

  it("applies regex patterns case-insensitively", () => {
    const filter = createPrivacyFilter(["password"]);
    const input = "PASSWORD and Password and password all match";
    const result = filter.filter(input);
    expect(result).toBe("[REDACTED] and [REDACTED] and [REDACTED] all match");
  });

  it("filters both <private> tags and custom patterns together", () => {
    const filter = createPrivacyFilter(["\\d{3}-\\d{2}-\\d{4}"]);
    const input = "SSN: 123-45-6789 and <private>api-key-here</private>";
    const result = filter.filter(input);
    expect(result).toBe("SSN: [REDACTED] and [REDACTED]");
  });
});
