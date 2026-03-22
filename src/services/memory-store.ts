import type { Database } from "bun:sqlite";
import { generateMemoryId } from "../config.js";
import type { EmbeddingService } from "./embedding.js";
import type { Memory, MemorySearchResult, PluginConfig, MemoryType, MemoryStats } from "../types.js";
import type { VectorBackend } from "./vector-backend.js";
import type { PrivacyFilter } from "./privacy.js";
import type { DedupService } from "./dedup.js";
import type { Logger } from "./logger.js";
import { encodeVector } from "./vector-backend.js";
import { fts5ExactSearch, fts5FuzzySearch } from "./fts5-search.js";
import { rrfFuse, applyPostRRFBonus } from "./search-fusion.js";

export interface MemoryStore {
  add(
    content: string,
    options?: {
      tags?: string;
      type?: MemoryType;
      metadata?: Record<string, unknown>;
    }
  ): Promise<Memory>;
  search(query: string, limit?: number): Promise<MemorySearchResult[]>;
  list(limit?: number, offset?: number): Promise<Memory[]>;
  forget(memoryId: string): Promise<boolean>;
  get(memoryId: string): Promise<Memory | null>;
  retryPendingEmbeddings(batchSize?: number): Promise<number>;
  getStats(): Promise<MemoryStats>;
  recordSearchHit(ids: string[]): Promise<void>;
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
    searchHitCount: (row as any).search_hit_count ?? 0,
    lastAccessedAt: (row as any).last_accessed_at ?? undefined,
  };
}

export function createMemoryStore(
  db: Database,
  embeddingService: EmbeddingService,
  config: PluginConfig,
  vectorBackend: VectorBackend,
  privacyFilter?: PrivacyFilter,
  dedupService?: DedupService,
  logger?: Logger
): MemoryStore {
  const _privacyFilter = privacyFilter ?? { filter: (c: string) => c };
  const _dedupService = dedupService ?? {
    checkExact: () => ({ isDuplicate: false }),
    checkSimilar: async () => ({ isDuplicate: false }),
    registerHash: () => {},
  };
  const _logger = logger ?? {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
  };

  return {
    async add(rawContent, options) {
      let content = rawContent;
      const id = generateMemoryId();
      const now = Date.now();
      const tags = options?.tags ?? "";
      const type = options?.type ?? "general";
      const metadata = JSON.stringify(options?.metadata ?? {});

      try {
        content = _privacyFilter.filter(content);

        const exactCheck = _dedupService.checkExact(content);
        if (exactCheck.isDuplicate && exactCheck.existingId) {
          const existingRow = db
            .query("SELECT * FROM memories WHERE id = ?")
            .get(exactCheck.existingId) as any | null;
          if (existingRow) {
            return rowToMemory(existingRow);
          }
        }

        db.query(
          "INSERT INTO memories (id, content, tags, type, metadata, embedding_status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
        ).run(id, content, tags, type, metadata, "pending", now, now);

        const embeddingResult = await embeddingService.embed(content, "document");

        if ("embedding" in embeddingResult) {
          const vector = new Float32Array(embeddingResult.embedding);
          db.query("UPDATE memories SET vector = ? WHERE id = ?").run(encodeVector(vector), id);
          await vectorBackend.add(id, vector);

          const updatedAt = Date.now();
          db.query(
            "UPDATE memories SET embedding_status = 'done', updated_at = ? WHERE id = ?"
          ).run(updatedAt, id);

          const similarCheck = await _dedupService.checkSimilar(vector);
          if (similarCheck.isDuplicate) {
            _logger.warn("Similar memory detected, storing anyway", {
              existingId: similarCheck.existingId,
              similarity: similarCheck.similarity,
            });
          }
        }

        _dedupService.registerHash(id, content);

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

      if (!query || query.trim().length === 0) {
        return [];
      }

      if (!config.searchLayersEnabled) {
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

      void this.retryPendingEmbeddings(5).catch(() => undefined);

      const exactResults = fts5ExactSearch(db, query, finalLimit);

      const semanticResults: Array<{ id: string; rank: number }> = [];
      const vectorDistances = new Map<string, number>();

      try {
        const queryEmbedding = await embeddingService.embed(query, "query");

        if ("embedding" in queryEmbedding) {
          const queryVec = new Float32Array(queryEmbedding.embedding);
          const matches = await vectorBackend.search(queryVec, finalLimit);

          for (let i = 0; i < matches.length; i += 1) {
            const match = matches[i];
            if (!match) {
              continue;
            }
            semanticResults.push({ id: match.id, rank: i + 1 });
            vectorDistances.set(match.id, 1 - match.score);
          }
        }
      } catch {
      }

      const fuzzyResults = fts5FuzzySearch(db, query, finalLimit);
      const fusedScores = rrfFuse([exactResults, semanticResults, fuzzyResults]);

      if (fusedScores.size === 0) {
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

      const bonuses = new Map<string, number>();
      for (const id of fusedScores.keys()) {
        const row = db
          .query("SELECT created_at, tags FROM memories WHERE id = ?")
          .get(id) as { created_at: number; tags: string } | null;
        if (!row) {
          continue;
        }

        const ageDays = (Date.now() - row.created_at) / 86400000;
        const recencyBonus = Math.exp(-ageDays / 30) * 0.01;
        const queryWords = query.toLowerCase().split(/\s+/);
        const tagBonus = queryWords.some((w) => (row.tags ?? "").toLowerCase().includes(w))
          ? 0.005
          : 0;
        bonuses.set(id, recencyBonus + tagBonus);
      }

      const finalScores = applyPostRRFBonus(fusedScores, bonuses);

      const results: MemorySearchResult[] = [];
      for (const [id, score] of finalScores) {
        const row = db.query("SELECT * FROM memories WHERE id = ?").get(id) as any | null;
        if (!row) {
          continue;
        }

        const memory = rowToMemory(row);
        results.push({
          ...memory,
          score,
          distance: vectorDistances.get(id) ?? Number.POSITIVE_INFINITY,
        });
      }

      results.sort((a, b) => b.score - a.score);
      return results.slice(0, finalLimit);
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
          pendingRows.map((row) => row.content),
          "document"
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

    async getStats(): Promise<MemoryStats> {
      try {
        const totalRow = db.query("SELECT COUNT(*) as total FROM memories").get() as { total: number };
        const typeRows = db.query("SELECT type, COUNT(*) as count FROM memories GROUP BY type").all() as Array<{ type: string; count: number }>;
        const statusRows = db.query("SELECT embedding_status, COUNT(*) as count FROM memories GROUP BY embedding_status").all() as Array<{ embedding_status: string; count: number }>;
        const rangeRow = db.query("SELECT MIN(created_at) as oldest, MAX(created_at) as newest FROM memories").get() as { oldest: number | null; newest: number | null };

        const byType: Record<string, number> = {};
        for (const row of typeRows) {
          byType[row.type] = row.count;
        }

        const byEmbeddingStatus: Record<string, number> = {};
        for (const row of statusRows) {
          byEmbeddingStatus[row.embedding_status] = row.count;
        }

        return {
          total: totalRow.total,
          byType,
          byEmbeddingStatus,
          oldest: rangeRow.oldest ?? null,
          newest: rangeRow.newest ?? null,
        };
      } catch {
        return {
          total: 0,
          byType: {},
          byEmbeddingStatus: {},
          oldest: null,
          newest: null,
        };
      }
    },

    async recordSearchHit(ids: string[]): Promise<void> {
      if (ids.length === 0) {
        return;
      }

      const now = Date.now();
      for (const id of ids) {
        try {
          db.query("UPDATE memories SET search_hit_count = search_hit_count + 1, last_accessed_at = ? WHERE id = ?").run(now, id);
        } catch {
          // silently ignore update errors
        }
      }
    },
  };
}
