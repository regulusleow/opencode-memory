import { describe, it, expect } from "bun:test";
import { detectLanguage, hasCJK } from "../src/services/language-detect";

describe("detectLanguage", () => {
  it('returns "en" for english text', () => {
    expect(detectLanguage("hello world")).toBe("en");
  });

  it('returns "cjk" for chinese text', () => {
    expect(detectLanguage("你好世界")).toBe("cjk");
  });

  it('returns "cjk" for hiragana text', () => {
    expect(detectLanguage("こんにちは")).toBe("cjk");
  });

  it('returns "cjk" for korean text', () => {
    expect(detectLanguage("안녕하세요")).toBe("cjk");
  });

  it('returns "mixed" for mixed english and chinese', () => {
    expect(detectLanguage("hello 你好")).toBe("mixed");
  });

  it('returns "en" for numbers and punctuation only', () => {
    expect(detectLanguage("123!@#")).toBe("en");
  });

  it('returns "en" for empty string', () => {
    expect(detectLanguage("")).toBe("en");
  });

  it('returns "cjk" for single chinese character', () => {
    expect(detectLanguage("你")).toBe("cjk");
  });

  it('returns "mixed" for code with CJK comment', () => {
    expect(detectLanguage("const x = 1; // 变量")).toBe("mixed");
  });

  it('returns "en" for uppercase english', () => {
    expect(detectLanguage("HELLO WORLD")).toBe("en");
  });

  it('returns "cjk" for CJK extension A', () => {
    expect(detectLanguage("㐀")).toBe("cjk");
  });

  it('returns "mixed" for japanese katakana and english', () => {
    expect(detectLanguage("hello カタカナ")).toBe("mixed");
  });
});

describe("hasCJK", () => {
  it("returns true for chinese text", () => {
    expect(hasCJK("你好")).toBe(true);
  });

  it("returns false for english text", () => {
    expect(hasCJK("hello")).toBe(false);
  });

  it("returns true for mixed text", () => {
    expect(hasCJK("hello 你好")).toBe(true);
  });

  it("returns false for numbers and punctuation only", () => {
    expect(hasCJK("123!@#")).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(hasCJK("")).toBe(false);
  });

  it("returns true for hiragana", () => {
    expect(hasCJK("こんにちは")).toBe(true);
  });
});
