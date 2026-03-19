import type { Database } from "bun:sqlite";
import { generateMemoryId } from "../config.js";
import type { EmbeddingService } from "./embedding.js";
import type { Memory, MemorySearchResult, PluginConfig } from "../types.js";
import type { VectorBackend } from "./vector-backend.js";
import { encodeVector } from "./vector-backend.js";

export interface MemoryStore {
  add(
    content: string,
    options?: {
      tags?: string;
      type?: string;
      metadata?: Record<string, unknown>;
    }
  ): Promise<Memory>;
  search(query: string, limit?: number): Promise<MemorySearchResult[]>;
  list(limit?: number, offset?: number): Promise<Memory[]>;
  forget(memoryId: string): Promise<boolean>;
  get(memoryId: string): Promise<Memory | null>;
  retryPendingEmbeddings(batchSize?: number): Promise<number>;
}

function rowToMemory(row: any): Memory {
  let metadata: Record<string, unknown> = {};

  try {
    metadata = JSON.parse(row.metadata ?? "{}");
  } catch {
    metadata = {};
  }

  return {
    id: row.id,
    content: row.content,
    tags: row.tags,
    type: row.type,
    metadata,
    embeddingStatus: row.embedding_status as "pending" | "done" | "failed",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createMemoryStore(
  db: Database,
  embeddingService: EmbeddingService,
  config: PluginConfig,
  vectorBackend: VectorBackend
): MemoryStore {
  return {
    async add(content, options) {
      const id = generateMemoryId();
      const now = Date.now();
      const tags = options?.tags ?? "";
      const type = options?.type ?? "general";
      const metadata = JSON.stringify(options?.metadata ?? {});

      try {
        db.query(
          "INSERT INTO memories (id, content, tags, type, metadata, embedding_status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
        ).run(id, content, tags, type, metadata, "pending", now, now);

        const embeddingResult = await embeddingService.embed(content);

        if ("embedding" in embeddingResult) {
          const vector = new Float32Array(embeddingResult.embedding);
          db.query("UPDATE memories SET vector = ? WHERE id = ?").run(encodeVector(vector), id);
          await vectorBackend.add(id, vector);

          const updatedAt = Date.now();
          db.query(
            "UPDATE memories SET embedding_status = 'done', updated_at = ? WHERE id = ?"
          ).run(updatedAt, id);
        }

        const stored = db
          .query("SELECT * FROM memories WHERE id = ?")
          .get(id) as any | null;

        if (!stored) {
          return {
            id,
            content,
            tags,
            type,
            metadata: options?.metadata ?? {},
            embeddingStatus: "pending",
            createdAt: now,
            updatedAt: now,
          };
        }

        return rowToMemory(stored);
      } catch {
        return {
          id,
          content,
          tags,
          type,
          metadata: options?.metadata ?? {},
          embeddingStatus: "pending",
          createdAt: now,
          updatedAt: now,
        };
      }
    },

    async search(query, limit) {
      const finalLimit = limit ?? config.searchLimit;

      void this.retryPendingEmbeddings(5).catch(() => undefined);

      try {
        const queryEmbedding = await embeddingService.embed(query);

        const vectorResults: MemorySearchResult[] = [];
        if ("embedding" in queryEmbedding) {
          const queryVec = new Float32Array(queryEmbedding.embedding);
          const matches = await vectorBackend.search(queryVec, finalLimit);

          for (const match of matches) {
            const row = db
              .query("SELECT * FROM memories WHERE id = ?")
              .get(match.id) as any | null;
            if (!row) {
              continue;
            }

            const memory = rowToMemory(row);
            vectorResults.push({
              ...memory,
              score: match.score,
              distance: 1 - match.score,
            });
          }
        }

        const likeQuery = `%${query}%`;
        const textRows = db
          .query(
            "SELECT * FROM memories WHERE content LIKE ? OR tags LIKE ? ORDER BY created_at DESC LIMIT ?"
          )
          .all(likeQuery, likeQuery, finalLimit) as any[];

        const textResults = textRows.map((row) => {
          const memory = rowToMemory(row);
          return {
            ...memory,
            score: 0,
            distance: Number.POSITIVE_INFINITY,
          } satisfies MemorySearchResult;
        });

        if (!("embedding" in queryEmbedding)) {
          return textResults.slice(0, finalLimit);
        }

        const merged: MemorySearchResult[] = [];
        const seen = new Set<string>();

        for (const result of vectorResults) {
          if (seen.has(result.id)) {
            continue;
          }
          seen.add(result.id);
          merged.push(result);
        }

        for (const result of textResults) {
          if (seen.has(result.id)) {
            continue;
          }
          seen.add(result.id);
          merged.push(result);
        }

        return merged.slice(0, finalLimit);
      } catch {
        const likeQuery = `%${query}%`;
        const textRows = db
          .query(
            "SELECT * FROM memories WHERE content LIKE ? OR tags LIKE ? ORDER BY created_at DESC LIMIT ?"
          )
          .all(likeQuery, likeQuery, finalLimit) as any[];

        return textRows.map((row) => ({
          ...rowToMemory(row),
          score: 0,
          distance: Number.POSITIVE_INFINITY,
        }));
      }
    },

    async list(limit, offset) {
      const finalLimit = limit ?? config.searchLimit;
      const finalOffset = offset ?? 0;

      try {
        const rows = db
          .query("SELECT * FROM memories ORDER BY created_at DESC LIMIT ? OFFSET ?")
          .all(finalLimit, finalOffset) as any[];

        return rows.map((row) => rowToMemory(row));
      } catch {
        return [];
      }
    },

    async forget(memoryId) {
      try {
        const deleted = db
          .query("DELETE FROM memories WHERE id = ?")
          .run(memoryId) as { changes: number };

        await vectorBackend.remove(memoryId);

        return deleted.changes > 0;
      } catch {
        return false;
      }
    },

    async get(memoryId) {
      try {
        const row = db
          .query("SELECT * FROM memories WHERE id = ?")
          .get(memoryId) as any | null;

        if (!row) {
          return null;
        }

        return rowToMemory(row);
      } catch {
        return null;
      }
    },

    async retryPendingEmbeddings(batchSize = 10) {
      try {
        const pendingRows = db
          .query(
            "SELECT id, content FROM memories WHERE embedding_status = 'pending' ORDER BY created_at ASC LIMIT ?"
          )
          .all(batchSize) as Array<{ id: string; content: string }>;

        if (pendingRows.length === 0) {
          return 0;
        }

        const results = await embeddingService.embedBatch(
          pendingRows.map((row) => row.content)
        );

        const updatedAt = Date.now();
        let embeddedCount = 0;

        for (let i = 0; i < pendingRows.length; i += 1) {
          const row = pendingRows[i];
          const result = results[i];

          if (!row || !result) {
            continue;
          }

          if ("embedding" in result) {
            const vector = new Float32Array(result.embedding);
            db.query("UPDATE memories SET vector = ? WHERE id = ?").run(encodeVector(vector), row.id);
            await vectorBackend.add(row.id, vector);

            db.query(
              "UPDATE memories SET embedding_status = 'done', updated_at = ? WHERE id = ?"
            ).run(updatedAt, row.id);

            embeddedCount += 1;
          } else {
            db.query(
              "UPDATE memories SET embedding_status = 'failed', updated_at = ? WHERE id = ?"
            ).run(updatedAt, row.id);
          }
        }

        return embeddedCount;
      } catch {
        return 0;
      }
    },
  };
}
