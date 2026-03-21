import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { createDatabase } from "../src/services/database.js";
import {
  sanitizeFTS5Query,
  fts5ExactSearch,
  fts5FuzzySearch,
} from "../src/services/fts5-search.js";

describe("fts5-search", () => {
  let db: Database;

  beforeEach(() => {
    db = createDatabase(":memory:", 384);
  });

  describe("sanitizeFTS5Query", () => {
    it("returns null for empty string", () => {
      expect(sanitizeFTS5Query("")).toBeNull();
    });

    it("returns null for whitespace-only string", () => {
      expect(sanitizeFTS5Query("  ")).toBeNull();
    });

    it("returns null for 2 characters (less than trigram minimum)", () => {
      expect(sanitizeFTS5Query("ab")).toBeNull();
    });

    it("wraps 3 characters in double quotes", () => {
      expect(sanitizeFTS5Query("abc")).toBe('"abc"');
    });

    it("escapes double quotes in query with doubled quotes", () => {
      expect(sanitizeFTS5Query('hello "world"')).toBe('"hello ""world"""');
    });

    it("handles complex special characters", () => {
      expect(sanitizeFTS5Query('(hello) "world"')).toBe('"(hello) ""world"""');
    });

    it("wraps multi-word query in double quotes", () => {
      expect(sanitizeFTS5Query("hello world")).toBe('"hello world"');
    });

    it("counts code points correctly for CJK characters", () => {
      expect(sanitizeFTS5Query("面向对")).toBe('"面向对"');
    });
  });

  describe("fts5ExactSearch", () => {
    it("returns empty array for empty database", () => {
      const results = fts5ExactSearch(db, "hello", 10);
      expect(results).toEqual([]);
    });

    it("returns empty array for short query", () => {
      const results = fts5ExactSearch(db, "ab", 10);
      expect(results).toEqual([]);
    });

    it("returns empty array for empty query", () => {
      const results = fts5ExactSearch(db, "", 10);
      expect(results).toEqual([]);
    });

    it("finds English phrase match", () => {
      const now = Date.now();
      db.query(
        `INSERT INTO memories (id, content, tags, type, metadata, embedding_status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        "mem1",
        "TypeScript is a typed superset of JavaScript",
        "",
        "general",
        "{}",
        "pending",
        now,
        now
      );

      const results = fts5ExactSearch(db, "typed superset", 10);
      expect(results.length).toBe(1);
      expect(results[0]).toEqual({ id: "mem1", rank: 1 });
    });

    it("finds CJK phrase match", () => {
      const now = Date.now();
      db.query(
        `INSERT INTO memories (id, content, tags, type, metadata, embedding_status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        "mem-cjk",
        "Objective-C 是一门面向对象的编程语言",
        "",
        "general",
        "{}",
        "pending",
        now,
        now
      );

      const results = fts5ExactSearch(db, "面向对象", 10);
      expect(results.length).toBe(1);
      expect(results[0]).toEqual({ id: "mem-cjk", rank: 1 });
    });

    it("handles special characters without crashing", () => {
      const now = Date.now();
      db.query(
        `INSERT INTO memories (id, content, tags, type, metadata, embedding_status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        "mem2",
        "This (hello) \"world\" *star*",
        "",
        "general",
        "{}",
        "pending",
        now,
        now
      );

      const results = fts5ExactSearch(db, '(hello) "world" *star*', 10);
      expect(Array.isArray(results)).toBe(true);
    });

    it("ranks multiple results by FTS5 rank order", () => {
      const now = Date.now();
      db.query(
        `INSERT INTO memories (id, content, tags, type, metadata, embedding_status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        "mem-a",
        "hello world hello",
        "",
        "general",
        "{}",
        "pending",
        now,
        now
      );

      db.query(
        `INSERT INTO memories (id, content, tags, type, metadata, embedding_status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        "mem-b",
        "hello there",
        "",
        "general",
        "{}",
        "pending",
        now,
        now
      );

      const results = fts5ExactSearch(db, "hello", 10);
      expect(results.length).toBe(2);
      expect(results[0].rank).toBe(1);
      expect(results[1].rank).toBe(2);
    });

    it("respects limit parameter", () => {
      const now = Date.now();
      for (let i = 0; i < 5; i++) {
        db.query(
          `INSERT INTO memories (id, content, tags, type, metadata, embedding_status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          `mem-${i}`,
          "hello world test",
          "",
          "general",
          "{}",
          "pending",
          now,
          now
        );
      }

      const results = fts5ExactSearch(db, "hello", 2);
      expect(results.length).toBe(2);
    });
  });

  describe("fts5FuzzySearch", () => {
    it("returns empty array for empty query", () => {
      const results = fts5FuzzySearch(db, "", 10);
      expect(results).toEqual([]);
    });

    it("finds English with OR across multiple words", () => {
      const now = Date.now();
      db.query(
        `INSERT INTO memories (id, content, tags, type, metadata, embedding_status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        "mem-en",
        "TypeScript is great for web development",
        "",
        "general",
        "{}",
        "pending",
        now,
        now
      );

      const results = fts5FuzzySearch(db, "typescript great", 10);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0]).toEqual({ id: "mem-en", rank: 1 });
    });

    it("uses exact search for CJK queries", () => {
      const now = Date.now();
      db.query(
        `INSERT INTO memories (id, content, tags, type, metadata, embedding_status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        "mem-cjk-fuzzy",
        "面向对象编程是现代软件开发的基础",
        "",
        "general",
        "{}",
        "pending",
        now,
        now
      );

      const results = fts5FuzzySearch(db, "面向对象", 10);
      expect(results.length).toBe(1);
      expect(results[0]).toEqual({ id: "mem-cjk-fuzzy", rank: 1 });
    });

    it("filters out English words shorter than 3 characters", () => {
      const now = Date.now();
      db.query(
        `INSERT INTO memories (id, content, tags, type, metadata, embedding_status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        "mem-en-short",
        "TypeScript is great",
        "",
        "general",
        "{}",
        "pending",
        now,
        now
      );

      // Query with all short words should return empty
      const results = fts5FuzzySearch(db, "is it a", 10);
      expect(results).toEqual([]);
    });

    it("handles mixed-language query by falling back to exact search", () => {
      const now = Date.now();
      db.query(
        `INSERT INTO memories (id, content, tags, type, metadata, embedding_status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        "mem-mixed",
        "TypeScript 和 JavaScript 的混合查询",
        "",
        "general",
        "{}",
        "pending",
        now,
        now
      );

      const results = fts5FuzzySearch(db, "TypeScript 和", 10);
      expect(Array.isArray(results)).toBe(true);
    });
  });
});
