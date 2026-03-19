import { afterEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { closeDatabase, createDatabase } from "../src/services/database";

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

  it("creates memories table without any virtual table", () => {
    const db = createDatabase(":memory:", 4);

    const rows = db
      .query("SELECT name FROM sqlite_master WHERE type IN ('table', 'view')")
      .all() as Array<{ name: string }>;
    const names = new Set(rows.map((row) => row.name));

    expect(names.has("memories")).toBe(true);
    expect(names.size).toBe(1);

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
});
