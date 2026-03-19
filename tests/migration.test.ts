import { describe, expect, it } from "bun:test";
import { createDatabase, getEmbeddingMeta, setEmbeddingMeta } from "../src/services/database";
import { detectDimensionMismatch, freshStartMigration } from "../src/services/migration";

describe("migration service", () => {
  it("detectDimensionMismatch() returns no migration when meta is empty", () => {
    const db = createDatabase(":memory:", 4);

    expect(detectDimensionMismatch(db, "text-embedding-3-small", 1536)).toEqual({
      needsMigration: false,
      storedModel: null,
      storedDimensions: null,
    });
  });

  it("detectDimensionMismatch() returns no migration when model and dimensions match", () => {
    const db = createDatabase(":memory:", 4);
    setEmbeddingMeta(db, "text-embedding-3-small", 1536);

    expect(detectDimensionMismatch(db, "text-embedding-3-small", 1536)).toEqual({
      needsMigration: false,
      storedModel: "text-embedding-3-small",
      storedDimensions: 1536,
    });
  });

  it("detectDimensionMismatch() returns migration needed when dimensions differ", () => {
    const db = createDatabase(":memory:", 4);
    setEmbeddingMeta(db, "text-embedding-3-small", 1536);

    expect(detectDimensionMismatch(db, "text-embedding-3-small", 768)).toEqual({
      needsMigration: true,
      storedModel: "text-embedding-3-small",
      storedDimensions: 1536,
    });
  });

  it("detectDimensionMismatch() returns migration needed when model differs", () => {
    const db = createDatabase(":memory:", 4);
    setEmbeddingMeta(db, "text-embedding-3-small", 1536);

    expect(detectDimensionMismatch(db, "nomic-embed-text-v1.5", 1536)).toEqual({
      needsMigration: true,
      storedModel: "text-embedding-3-small",
      storedDimensions: 1536,
    });
  });

  it("freshStartMigration() clears vectors and marks all embeddings pending", () => {
    const db = createDatabase(":memory:", 4);
    const now = Date.now();

    db.query(
      "INSERT INTO memories (id, content, tags, type, metadata, embedding_status, vector, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(
      "mem_1",
      "memory 1",
      "",
      "general",
      "{}",
      "done",
      new Uint8Array(new Float32Array([0.1, 0.2, 0.3, 0.4]).buffer.slice(0)),
      now,
      now
    );

    db.query(
      "INSERT INTO memories (id, content, tags, type, metadata, embedding_status, vector, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(
      "mem_2",
      "memory 2",
      "",
      "general",
      "{}",
      "failed",
      new Uint8Array(new Float32Array([0.5, 0.6, 0.7, 0.8]).buffer.slice(0)),
      now,
      now
    );

    freshStartMigration(db, "nomic-embed-text-v1.5", 768);

    const rows = db
      .query("SELECT embedding_status, vector FROM memories ORDER BY id")
      .all() as Array<{ embedding_status: string; vector: Uint8Array | null }>;

    expect(rows).toEqual([
      { embedding_status: "pending", vector: null },
      { embedding_status: "pending", vector: null },
    ]);

    expect(getEmbeddingMeta(db)).toEqual({
      modelName: "nomic-embed-text-v1.5",
      dimensions: 768,
    });
  });
});
