import type { Database } from "bun:sqlite";

export interface VectorBackend {
  add(id: string, vector: Float32Array): Promise<void>;
  search(query: Float32Array, limit: number): Promise<Array<{ id: string; score: number }>>;
  remove(id: string): Promise<void>;
}

export function encodeVector(v: Float32Array): Uint8Array {
  return new Uint8Array(v.buffer.slice(0));
}

export function decodeVector(blob: Uint8Array, dimensions: number): Float32Array {
  return new Float32Array(blob.buffer, 0, dimensions);
}

function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += (a[i] ?? 0) * (b[i] ?? 0);
    normA += (a[i] ?? 0) * (a[i] ?? 0);
    normB += (b[i] ?? 0) * (b[i] ?? 0);
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

class ExactScanBackend implements VectorBackend {
  constructor(private db: Database, private dimensions: number) {}

  async add(_id: string, _vector: Float32Array): Promise<void> {
    // no-op: vectors are already persisted in SQLite by memory-store before calling this
  }

  async search(query: Float32Array, limit: number): Promise<Array<{ id: string; score: number }>> {
    const rows = this.db
      .query("SELECT id, vector FROM memories WHERE vector IS NOT NULL")
      .all() as Array<{ id: string; vector: Uint8Array }>;

    const scored = rows.map((row) => {
      const vec = decodeVector(row.vector, this.dimensions);
      return { id: row.id, score: cosineSimilarity(query, vec) };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit);
  }

  async remove(_id: string): Promise<void> {
    // no-op: memory row is fully deleted by memory-store; nothing to remove from in-memory state
  }
}

class USearchBackend implements VectorBackend {
  private index: any;
  private idToKey = new Map<string, bigint>();
  private keyToId = new Map<bigint, string>();
  private nextKey = 0n;
  private loaded = false;

  constructor(
    private db: Database,
    private dimensions: number,
    private usearchModule: any
  ) {
    this.index = new usearchModule.Index({ dimensions, metric: "cos" });
  }

  async add(id: string, vector: Float32Array): Promise<void> {
    const key = this.nextKey++;
    this.idToKey.set(id, key);
    this.keyToId.set(key, id);
    this.index.add(key, vector);
  }

  async search(query: Float32Array, limit: number): Promise<Array<{ id: string; score: number }>> {
    if (!this.loaded) {
      await this.loadFromDb();
    }
    if (this.index.size() === 0) {
      return [];
    }
    const results = this.index.search(query, limit);
    const output: Array<{ id: string; score: number }> = [];
    for (let i = 0; i < results.keys.length; i++) {
      const key = results.keys[i] as bigint;
      const id = this.keyToId.get(key);
      if (id !== undefined) {
        output.push({ id, score: 1 - (results.distances[i] as number) });
      }
    }
    return output;
  }

  async remove(id: string): Promise<void> {
    const key = this.idToKey.get(id);
    if (key !== undefined) {
      this.index.remove(key);
      this.idToKey.delete(id);
      this.keyToId.delete(key);
    }
  }

  private async loadFromDb(): Promise<void> {
    this.loaded = true;
    const rows = this.db
      .query("SELECT id, vector FROM memories WHERE vector IS NOT NULL")
      .all() as Array<{ id: string; vector: Uint8Array }>;
    for (const row of rows) {
      const vec = decodeVector(row.vector, this.dimensions);
      const key = this.nextKey++;
      this.idToKey.set(row.id, key);
      this.keyToId.set(key, row.id);
      this.index.add(key, vec);
    }
  }
}

type UsearchImporter = () => Promise<any>;

export async function createVectorBackend(
  db: Database,
  dimensions: number,
  importFn: UsearchImporter = () => import("usearch")
): Promise<VectorBackend> {
  try {
    const usearch = await importFn();
    return new USearchBackend(db, dimensions, usearch);
  } catch {
    return new ExactScanBackend(db, dimensions);
  }
}
