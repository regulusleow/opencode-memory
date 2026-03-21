import { afterEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  closeDatabase,
  createDatabase,
  getEmbeddingMeta,
  setEmbeddingMeta,
} from "../src/services/database";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("database module", () => {
  it("createDatabase() with :memory: succeeds", () => {
    const db = createDatabase(":memory:", 4);
    expect(db).toBeTruthy();
    closeDatabase(db);
  });

  it("creates memories, embedding_meta, and memories_fts tables", () => {
    const db = createDatabase(":memory:", 4);

    const rows = db
      .query("SELECT name FROM sqlite_master WHERE type IN ('table', 'view') AND name NOT LIKE '%_fts_%'")
      .all() as Array<{ name: string }>;
    const names = new Set(rows.map((row) => row.name));

    expect(names.has("memories")).toBe(true);
    expect(names.has("embedding_meta")).toBe(true);

    closeDatabase(db);
  });

  it("memories_fts virtual table exists after createDatabase()", () => {
    const db = createDatabase(":memory:", 4);

    const ftsTable = db
      .query("SELECT name FROM sqlite_master WHERE type='table' AND name='memories_fts'")
      .get() as { name: string } | null;

    expect(ftsTable).not.toBeNull();

    closeDatabase(db);
  });

  it("FTS5 triggers sync inserted memory", () => {
    const db = createDatabase(":memory:", 4);
    const now = Date.now();

    db.query(
      "INSERT INTO memories (id, content, tags, type, metadata, embedding_status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    ).run("fts_test_1", "hello world memory", "test", "general", "{}", "done", now, now);

    const result = db
      .query(
        "SELECT m.id FROM memories m WHERE m.rowid IN (SELECT rowid FROM memories_fts WHERE memories_fts MATCH 'hel')"
      )
      .get() as { id: string } | null;

    expect(result?.id).toBe("fts_test_1");

    closeDatabase(db);
  });

  it("memories table has vector BLOB column", () => {
    const db = createDatabase(":memory:", 4);
    const cols = db.query("PRAGMA table_info(memories)").all() as Array<{
      name: string;
      type: string;
    }>;
    const vectorCol = cols.find((c) => c.name === "vector");
    expect(vectorCol).toBeDefined();
    expect(vectorCol?.type.toUpperCase()).toBe("BLOB");
    closeDatabase(db);
  });

  it("vector BLOB roundtrip: encode Float32Array, store, retrieve, decode", () => {
    const db = createDatabase(":memory:", 4);
    const original = new Float32Array([0.1, 0.2, 0.3, 0.4]);
    const blob = new Uint8Array(original.buffer.slice(0));
    const now = Date.now();
    db.query(
      "INSERT INTO memories (id, content, tags, type, metadata, embedding_status, vector, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).run("vec_roundtrip", "test", "", "general", "{}", "done", blob, now, now);
    const row = db.query("SELECT vector FROM memories WHERE id = ?").get("vec_roundtrip") as {
      vector: Uint8Array;
    };
    const decoded = new Float32Array(row.vector.buffer, 0, 4);
    expect(decoded[0]).toBeCloseTo(0.1, 5);
    expect(decoded[1]).toBeCloseTo(0.2, 5);
    expect(decoded[2]).toBeCloseTo(0.3, 5);
    expect(decoded[3]).toBeCloseTo(0.4, 5);
    closeDatabase(db);
  });

  it("inserts into memories table", () => {
    const db = createDatabase(":memory:", 4);

    db.query(
      `INSERT INTO memories (
        id, content, tags, type, metadata, embedding_status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      "mem_1",
      "hello memory",
      "ios,objc",
      "general",
      JSON.stringify({ source: "test" }),
      "pending",
      Date.now(),
      Date.now()
    );

    const inserted = db
      .query("SELECT id, content, embedding_status FROM memories WHERE id = ?")
      .get("mem_1") as { id: string; content: string; embedding_status: string };

    expect(inserted.id).toBe("mem_1");
    expect(inserted.content).toBe("hello memory");
    expect(inserted.embedding_status).toBe("pending");

    closeDatabase(db);
  });

  it("closeDatabase() closes cleanly", () => {
    const db = createDatabase(":memory:", 4);

    expect(() => closeDatabase(db)).not.toThrow();
  });

  it("schema creation is idempotent on same db path", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "opencode-memory-db-"));
    tempDirs.push(tempDir);
    const dbPath = join(tempDir, "memory.db");

    const db1 = createDatabase(dbPath, 4);
    closeDatabase(db1);

    expect(() => {
      const db2 = createDatabase(dbPath, 4);
      closeDatabase(db2);
    }).not.toThrow();
  });

  it("getEmbeddingMeta() returns nulls when table is empty", () => {
    const db = createDatabase(":memory:", 4);

    expect(getEmbeddingMeta(db)).toEqual({ modelName: null, dimensions: null });

    closeDatabase(db);
  });

  it("setEmbeddingMeta() writes model and dimensions", () => {
    const db = createDatabase(":memory:", 4);

    setEmbeddingMeta(db, "text-embedding-3-small", 1536);

    const rows = db
      .query("SELECT key, value FROM embedding_meta ORDER BY key")
      .all() as Array<{ key: string; value: string }>;

    expect(rows).toEqual([
      { key: "dimensions", value: "1536" },
      { key: "model_name", value: "text-embedding-3-small" },
    ]);

    closeDatabase(db);
  });

  it("getEmbeddingMeta() reads values written by setEmbeddingMeta()", () => {
    const db = createDatabase(":memory:", 4);

    setEmbeddingMeta(db, "nomic-embed-text-v1.5", 768);

   expect(getEmbeddingMeta(db)).toEqual({
     modelName: "nomic-embed-text-v1.5",
     dimensions: 768,
   });

   closeDatabase(db);
 });

 it("creates user_profiles table", () => {
   const db = createDatabase(":memory:", 4);
   const result = db
     .query("SELECT name FROM sqlite_master WHERE type='table' AND name='user_profiles'")
     .get() as { name: string } | null;
   expect(result).not.toBeNull();
   closeDatabase(db);
 });

 it("creates user_profile_changelog table", () => {
   const db = createDatabase(":memory:", 4);
   const result = db
     .query("SELECT name FROM sqlite_master WHERE type='table' AND name='user_profile_changelog'")
     .get() as { name: string } | null;
   expect(result).not.toBeNull();
   closeDatabase(db);
 });
});
