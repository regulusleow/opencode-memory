import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { createDedupService } from "../src/services/dedup.js";
import type { DedupResult } from "../src/services/dedup.js";
import type { VectorBackend } from "../src/services/vector-backend.js";
import { createHash } from "node:crypto";

function createTestDb(): Database {
  const db = new Database(":memory:");
  db.run(`
    CREATE TABLE IF NOT EXISTS memories (
      id TEXT PRIMARY KEY,
      content TEXT NOT NULL,
      tags TEXT DEFAULT '',
      type TEXT DEFAULT 'general',
      metadata TEXT DEFAULT '{}',
      embedding_status TEXT DEFAULT 'pending',
      vector BLOB,
      content_hash TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);
  return db;
}

function makeMockVectorBackend(
  results: Array<{ id: string; score: number }> = []
): VectorBackend & { lastSearchLimit?: number } {
  const backend: VectorBackend & { lastSearchLimit?: number } = {
    lastSearchLimit: undefined,
    async add(_id: string, _vector: Float32Array): Promise<void> {},
    async search(
      _query: Float32Array,
      limit: number
    ): Promise<Array<{ id: string; score: number }>> {
      backend.lastSearchLimit = limit;
      return results;
    },
    async remove(_id: string): Promise<void> {},
  };
  return backend;
}

describe("DedupService", () => {
  let db: Database;
  let mockVectorBackend: ReturnType<typeof makeMockVectorBackend>;

  beforeEach(() => {
    db = createTestDb();
    mockVectorBackend = makeMockVectorBackend();
  });

  it("checkExact() detects duplicate when same content was registered", () => {
    const now = Date.now();
    db.prepare(
      "INSERT INTO memories (id, content, tags, type, metadata, embedding_status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    ).run("mem_1", "hello world", "", "general", "{}", "done", now, now);

    const dedup = createDedupService(db, mockVectorBackend, {
      dedupSimilarityThreshold: 0.7,
    });

    dedup.registerHash("mem_1", "hello world");
    const result = dedup.checkExact("hello world");

    expect(result.isDuplicate).toBe(true);
    expect(result.reason).toBe("exact");
    expect(result.existingId).toBe("mem_1");
  });

  it("checkExact() returns no duplicate for different content", () => {
    const now = Date.now();
    db.prepare(
      "INSERT INTO memories (id, content, tags, type, metadata, embedding_status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    ).run("mem_1", "hello world", "", "general", "{}", "done", now, now);

    const dedup = createDedupService(db, mockVectorBackend, {
      dedupSimilarityThreshold: 0.7,
    });

    dedup.registerHash("mem_1", "hello world");
    const result = dedup.checkExact("goodbye world");

    expect(result.isDuplicate).toBe(false);
    expect(result.reason).toBeUndefined();
    expect(result.existingId).toBeUndefined();
  });

  it("checkSimilar() detects duplicate when score >= threshold", async () => {
    mockVectorBackend = makeMockVectorBackend([
      { id: "mem_1", score: 0.85 },
    ]);
    const dedup = createDedupService(db, mockVectorBackend, {
      dedupSimilarityThreshold: 0.7,
    });

    const queryVec = new Float32Array([0.1, 0.2, 0.3]);
    const result = await dedup.checkSimilar(queryVec);

    expect(result.isDuplicate).toBe(true);
    expect(result.reason).toBe("similar");
    expect(result.existingId).toBe("mem_1");
    expect(result.similarity).toBe(0.85);
  });

  it("checkSimilar() returns no duplicate when score < threshold", async () => {
    mockVectorBackend = makeMockVectorBackend([{ id: "mem_1", score: 0.5 }]);
    const dedup = createDedupService(db, mockVectorBackend, {
      dedupSimilarityThreshold: 0.7,
    });

    const queryVec = new Float32Array([0.1, 0.2, 0.3]);
    const result = await dedup.checkSimilar(queryVec);

    expect(result.isDuplicate).toBe(false);
    expect(result.similarity).toBeUndefined();
  });

  it("checkExact() works purely on hash without any embedding involved", () => {
    const dedup = createDedupService(db, mockVectorBackend, {
      dedupSimilarityThreshold: 0.7,
    });

    const now = Date.now();
    db.prepare(
      "INSERT INTO memories (id, content, tags, type, metadata, embedding_status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    ).run("mem_no_vec", "pure hash content", "", "general", "{}", "pending", now, now);

    dedup.registerHash("mem_no_vec", "pure hash content");

    const result = dedup.checkExact("pure hash content");
    expect(result.isDuplicate).toBe(true);
    expect(result.reason).toBe("exact");
    expect(result.existingId).toBe("mem_no_vec");
  });

  it("checkSimilar() calls vectorBackend.search with limit=50", async () => {
    const dedup = createDedupService(db, mockVectorBackend, {
      dedupSimilarityThreshold: 0.7,
    });

    const queryVec = new Float32Array([0.1, 0.2, 0.3]);
    await dedup.checkSimilar(queryVec);

    expect(mockVectorBackend.lastSearchLimit).toBe(50);
  });

  it("checkExact() and checkSimilar() return no duplicate on empty DB", async () => {
    const dedup = createDedupService(db, mockVectorBackend, {
      dedupSimilarityThreshold: 0.7,
    });

    const exactResult = dedup.checkExact("anything");
    expect(exactResult.isDuplicate).toBe(false);

    const queryVec = new Float32Array([0.1, 0.2, 0.3]);
    const similarResult = await dedup.checkSimilar(queryVec);
    expect(similarResult.isDuplicate).toBe(false);
  });

  it("same content always produces the same SHA256 hash", () => {
    const now = Date.now();
    db.prepare(
      "INSERT INTO memories (id, content, tags, type, metadata, embedding_status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    ).run("mem_a", "consistent content", "", "general", "{}", "done", now, now);

    const dedup = createDedupService(db, mockVectorBackend, {
      dedupSimilarityThreshold: 0.7,
    });

    dedup.registerHash("mem_a", "consistent content");

    const expectedHash = createHash("sha256")
      .update("consistent content")
      .digest("hex");

    const row = db
      .prepare("SELECT content_hash FROM memories WHERE id = ?")
      .get("mem_a") as { content_hash: string } | null;

    expect(row).not.toBeNull();
    expect(row!.content_hash).toBe(expectedHash);

    const ts = Date.now();
    db.prepare(
      "INSERT INTO memories (id, content, tags, type, metadata, embedding_status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    ).run("mem_b", "other content", "", "general", "{}", "done", ts, ts);
    dedup.registerHash("mem_b", "consistent content");

    const rowA = db
      .prepare("SELECT content_hash FROM memories WHERE id = ?")
      .get("mem_a") as { content_hash: string };
    const rowB = db
      .prepare("SELECT content_hash FROM memories WHERE id = ?")
      .get("mem_b") as { content_hash: string };

    expect(rowA.content_hash).toBe(rowB.content_hash);
    expect(rowA.content_hash).toBe(expectedHash);
  });

  it("registerHash() does not throw when memory ID does not exist", () => {
    const dedup = createDedupService(db, mockVectorBackend, {
      dedupSimilarityThreshold: 0.7,
    });

    expect(() => dedup.registerHash("nonexistent_id", "some content")).not.toThrow();
  });
});
