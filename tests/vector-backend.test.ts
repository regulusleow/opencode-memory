import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import type { Database } from "bun:sqlite";
import { createDatabase, closeDatabase } from "../src/services/database.js";
import { encodeVector, decodeVector, createVectorBackend } from "../src/services/vector-backend.js";

function insertVector(db: Database, id: string, vector: Float32Array): void {
  const blob = encodeVector(vector);
  db.query(
    "INSERT INTO memories (id, content, tags, type, metadata, embedding_status, vector, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(id, id, "", "general", "{}", "done", blob, Date.now(), Date.now());
}

function deleteVector(db: Database, id: string): void {
  db.query("DELETE FROM memories WHERE id = ?").run(id);
}

describe("VectorBackend", () => {
  let db: Database;

  beforeEach(() => {
    db = createDatabase(":memory:", 3);
  });

  afterEach(() => {
    closeDatabase(db);
  });

  it("factory search() finds closest vector", async () => {
    insertVector(db, "vec_a", new Float32Array([1, 0, 0]));
    insertVector(db, "vec_b", new Float32Array([0, 1, 0]));

    const backend = await createVectorBackend(db, 3);
    const results = await backend.search(new Float32Array([1, 0, 0]), 1);

    expect(results.length).toBe(1);
    expect(results[0]?.id).toBe("vec_a");
    expect(results[0]?.score).toBeCloseTo(1.0, 3);
  });

  it("factory search() returns empty array on empty database", async () => {
    const backend = await createVectorBackend(db, 3);
    const results = await backend.search(new Float32Array([1, 0, 0]), 5);

    expect(results).toEqual([]);
  });

  it("factory search() respects limit", async () => {
    for (let i = 0; i < 5; i++) {
      insertVector(db, `vec_${i}`, new Float32Array([i * 0.1, i * 0.2, i * 0.3]));
    }

    const backend = await createVectorBackend(db, 3);
    const results = await backend.search(new Float32Array([0.1, 0.2, 0.3]), 2);

    expect(results.length).toBeLessThanOrEqual(2);
  });

  it("factory search() excludes deleted rows", async () => {
    insertVector(db, "vec_deleted", new Float32Array([1, 0, 0]));
    deleteVector(db, "vec_deleted");

    const backend = await createVectorBackend(db, 3);
    const results = await backend.search(new Float32Array([1, 0, 0]), 5);

    expect(results).toEqual([]);
  });

  it("cosine similarity: identical vectors score ~1.0", async () => {
    insertVector(db, "vec_same", new Float32Array([0.5, 0.5, 0.0]));

    const backend = await createVectorBackend(db, 3);
    const results = await backend.search(new Float32Array([0.5, 0.5, 0.0]), 1);

    expect(results.length).toBe(1);
    expect(results[0]?.score).toBeCloseTo(1.0, 3);
  });

  it("cosine similarity: orthogonal vectors score lower than parallel", async () => {
    insertVector(db, "vec_parallel", new Float32Array([1, 0, 0]));
    insertVector(db, "vec_orthogonal", new Float32Array([0, 1, 0]));

    const backend = await createVectorBackend(db, 3);
    const results = await backend.search(new Float32Array([1, 0, 0]), 2);

    expect(results.length).toBe(2);
    expect(results[0]?.score).toBeGreaterThan(results[1]?.score ?? 0);
  });

  it("factory returns object with add/search/remove methods", async () => {
    const backend = await createVectorBackend(db, 3);

    expect(typeof backend.add).toBe("function");
    expect(typeof backend.search).toBe("function");
    expect(typeof backend.remove).toBe("function");
  });

  it("encodeVector / decodeVector roundtrip", () => {
    const original = new Float32Array([0.1, 0.2, 0.3]);
    const blob = encodeVector(original);
    const decoded = decodeVector(blob, 3);

    expect(decoded[0]).toBeCloseTo(0.1, 5);
    expect(decoded[1]).toBeCloseTo(0.2, 5);
    expect(decoded[2]).toBeCloseTo(0.3, 5);
  });

  it("factory + add() + search() finds vector (USearch path, skip if unavailable)", async () => {
    try {
      await import("usearch");
    } catch {
      return;
    }

    const backend = await createVectorBackend(db, 3);
    const vector = new Float32Array([0.7, 0.1, 0.2]);

    insertVector(db, "vec_usearch", vector);
    await backend.add("vec_usearch", vector);

    const results = await backend.search(vector, 1);

    expect(results.length).toBe(1);
    expect(results[0]?.id).toBe("vec_usearch");
  });

  it("ExactScan fallback: createVectorBackend with failing importer uses ExactScan", async () => {
    const failImporter = async () => {
      throw new Error("usearch unavailable");
    };

    const backend = await createVectorBackend(db, 3, failImporter);
    const vector = new Float32Array([0.1, 0.9, 0.0]);

    insertVector(db, "vec_exactscan", vector);

    const results = await backend.search(vector, 1);

    expect(results.length).toBe(1);
    expect(results[0]?.id).toBe("vec_exactscan");
  });
});
