import type { Database } from "bun:sqlite";
import { detectLanguage } from "./language-detect.js";

/**
 * Sanitize FTS5 query for phrase matching.
 * Returns null if query should not be sent to FTS5:
 * - empty or whitespace-only
 * - fewer than 3 characters (trigram minimum)
 * Escapes double quotes and wraps in quotes for phrase matching.
 */
export function sanitizeFTS5Query(query: string): string | null {
  const trimmed = query.trim();
  if (trimmed.length === 0) return null;

  // Count code points (not string length, for CJK safety)
  let charCount = 0;
  for (const _c of trimmed) charCount++;
  if (charCount < 3) return null;

  // Escape double quotes, then wrap in double quotes for phrase match
  const escaped = trimmed.replaceAll('"', '""');
  return `"${escaped}"`;
}

/**
 * FTS5 exact phrase search — JOIN to get memory id from rowid.
 * Returns array of {id, rank} sorted by FTS5 rank (best first).
 * Rank is 1-based position in result set.
 */
export function fts5ExactSearch(
  db: Database,
  query: string,
  limit: number
): Array<{ id: string; rank: number }> {
  const sanitized = sanitizeFTS5Query(query);
  if (sanitized === null) return [];

  try {
    const rows = db
      .query(
        `SELECT m.id FROM memories_fts f
         JOIN memories m ON m.rowid = f.rowid
         WHERE memories_fts MATCH ?
         ORDER BY rank
         LIMIT ?`
      )
      .all(sanitized, limit) as Array<{ id: string }>;
    return rows.map((row, i) => ({ id: row.id, rank: i + 1 }));
  } catch {
    return [];
  }
}

/**
 * FTS5 fuzzy search — for English: OR across individual words.
 * For CJK: trigram tokenizer handles substring matching via exact search.
 */
export function fts5FuzzySearch(
  db: Database,
  query: string,
  limit: number
): Array<{ id: string; rank: number }> {
  const trimmed = query.trim();
  if (trimmed.length === 0) return [];

  const lang = detectLanguage(trimmed);

  // For CJK queries, trigram already does substring matching — use exact search
  if (lang === "cjk" || lang === "mixed") {
    return fts5ExactSearch(db, query, limit);
  }

  // For English: split words, filter words >= 3 chars, build OR query
  const words = trimmed
    .split(/\s+/)
    .filter((w) => {
      let len = 0;
      for (const _c of w) len++;
      return len >= 3;
    });

  if (words.length === 0) return [];

  // Build: "word1" OR "word2" OR ...
  const orQuery = words.map((w) => `"${w.replaceAll('"', '""')}"`).join(" OR ");

  try {
    const rows = db
      .query(
        `SELECT m.id FROM memories_fts f
         JOIN memories m ON m.rowid = f.rowid
         WHERE memories_fts MATCH ?
         ORDER BY rank
         LIMIT ?`
      )
      .all(orQuery, limit) as Array<{ id: string }>;
    return rows.map((row, i) => ({ id: row.id, rank: i + 1 }));
  } catch {
    return [];
  }
}
