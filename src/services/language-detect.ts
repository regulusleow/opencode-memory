export type TextLanguage = "en" | "cjk" | "mixed";

export function detectLanguage(text: string): TextLanguage {
  let hasCJKChar = false;
  let hasLatinChar = false;

  for (const char of text) {
    const cp = char.codePointAt(0);
    if (cp === undefined) continue;

    if (
      (cp >= 0x4e00 && cp <= 0x9fff) ||  // CJK Unified Ideographs
      (cp >= 0x3040 && cp <= 0x309f) ||  // Hiragana
      (cp >= 0x30a0 && cp <= 0x30ff) ||  // Katakana
      (cp >= 0xac00 && cp <= 0xd7af) ||  // Hangul Syllables
      (cp >= 0x3400 && cp <= 0x4dbf)     // CJK Extension A
    ) {
      hasCJKChar = true;
    } else if (
      (cp >= 0x41 && cp <= 0x5a) ||  // A-Z
      (cp >= 0x61 && cp <= 0x7a)     // a-z
    ) {
      hasLatinChar = true;
    }

    if (hasCJKChar && hasLatinChar) return "mixed";
  }

  return hasCJKChar ? "cjk" : "en";
}

export function hasCJK(text: string): boolean {
  return detectLanguage(text) !== "en";
}
