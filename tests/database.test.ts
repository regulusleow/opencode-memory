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

  it("creates memories and memory_vectors schema", () => {
    const db = createDatabase(":memory:", 4);

    const rows = db
      .query("SELECT name FROM sqlite_master WHERE type IN ('table', 'view')")
      .all() as Array<{ name: string }>;
    const names = new Set(rows.map((row) => row.name));

    expect(names.has("memories")).toBe(true);
    expect(names.has("memory_vectors")).toBe(true);

    closeDatabase(db);
  });

  it("loads sqlite-vec extension and vec_version() returns string", () => {
    const db = createDatabase(":memory:", 4);

    const row = db
      .query("SELECT vec_version() AS version")
      .get() as { version: string };

    expect(typeof row.version).toBe("string");
    expect(row.version.length).toBeGreaterThan(0);

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

  it("supports vector insert and KNN MATCH query", () => {
    const db = createDatabase(":memory:", 4);

    db.query("INSERT INTO memory_vectors (id, embedding) VALUES (?, ?)").run(
      "vec_a",
      new Float32Array([0.1, 0.2, 0.3, 0.4])
    );
    db.query("INSERT INTO memory_vectors (id, embedding) VALUES (?, ?)").run(
      "vec_b",
      new Float32Array([0.9, 0.8, 0.7, 0.6])
    );

    const matches = db
      .query(
        "SELECT id, distance FROM memory_vectors WHERE embedding MATCH ? ORDER BY distance LIMIT 5"
      )
      .all(new Float32Array([0.1, 0.2, 0.3, 0.4])) as Array<{
      id: string;
      distance: number;
    }>;

    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0]?.id).toBe("vec_a");
    expect(typeof matches[0]?.distance).toBe("number");

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
