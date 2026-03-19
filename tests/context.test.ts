import { describe, it, expect } from "bun:test";
import {
  formatMemoryContext,
  formatMemoryList,
  formatHelp,
} from "../src/services/context.js";
import type { Memory, MemorySearchResult } from "../src/types.js";

describe("context formatting", () => {
  it("formatMemoryContext chat mode wraps in <relevant_memories> tags", () => {
    const memories: MemorySearchResult[] = [
      {
        id: "mem_001",
        content: "Found a bug in auth module",
        tags: "bug,auth",
        type: "issue",
        metadata: {},
        embeddingStatus: "done",
        createdAt: 1700000000000,
        updatedAt: 1700000000000,
        score: 0.95,
        distance: 0.05,
      },
      {
        id: "mem_002",
        content: "Implemented new caching strategy",
        tags: "performance,cache",
        type: "note",
        metadata: {},
        embeddingStatus: "done",
        createdAt: 1700010000000,
        updatedAt: 1700010000000,
        score: 0.88,
        distance: 0.12,
      },
    ];

    const result = formatMemoryContext(memories, "chat");

    expect(result).toContain("<relevant_memories>");
    expect(result).toContain("</relevant_memories>");
    expect(result).toContain("Found a bug in auth module");
    expect(result).toContain("Implemented new caching strategy");
    expect(result).toContain("tags: bug,auth");
    expect(result).toContain("tags: performance,cache");
  });

  it("formatMemoryContext search mode includes score and ID", () => {
    const memories: MemorySearchResult[] = [
      {
        id: "mem_001",
        content: "Database optimization notes",
        tags: "db,perf",
        type: "note",
        metadata: {},
        embeddingStatus: "done",
        createdAt: 1700000000000,
        updatedAt: 1700000000000,
        score: 0.92,
        distance: 0.08,
      },
    ];

    const result = formatMemoryContext(memories, "search");

    expect(result).toContain("[ID: mem_001]");
    expect(result).toContain("[Score: 0.92]");
    expect(result).toContain("Database optimization notes");
    expect(result).toContain("[Tags: db,perf]");
  });

  it("formatMemoryContext empty array returns correct defaults", () => {
    const empty: MemorySearchResult[] = [];

    const chatResult = formatMemoryContext(empty, "chat");
    const searchResult = formatMemoryContext(empty, "search");

    expect(chatResult).toBe("");
    expect(searchResult).toBe("No memories found.");
  });

  it("formatMemoryList shows memories with ID and content", () => {
    const memories: Memory[] = [
      {
        id: "mem_001",
        content: "Long content that should be truncated if needed",
        tags: "tag1,tag2",
        type: "note",
        metadata: {},
        embeddingStatus: "done",
        createdAt: 1700000000000,
        updatedAt: 1700000000000,
      },
      {
        id: "mem_002",
        content: "Another memory entry",
        tags: "tag3",
        type: "issue",
        metadata: {},
        embeddingStatus: "pending",
        createdAt: 1700010000000,
        updatedAt: 1700010000000,
      },
    ];

    const result = formatMemoryList(memories);

    expect(result).toContain("Memories (2 total):");
    expect(result).toContain("[mem_001]");
    expect(result).toContain("[mem_002]");
    expect(result).toContain("Long content that should be");
    expect(result).toContain("Another memory entry");
    expect(result).toContain("tags: tag1,tag2");
    expect(result).toContain("tags: tag3");
  });

  it("formatMemoryList empty array returns default message", () => {
    const result = formatMemoryList([]);
    expect(result).toBe("No memories stored yet.");
  });

  it("formatHelp returns non-empty string mentioning all 5 modes", () => {
    const result = formatHelp();

    expect(result).toBeTruthy();
    expect(result.length).toBeGreaterThan(0);
    expect(result).toContain("add");
    expect(result).toContain("search");
    expect(result).toContain("list");
    expect(result).toContain("forget");
    expect(result).toContain("help");
  });
});
