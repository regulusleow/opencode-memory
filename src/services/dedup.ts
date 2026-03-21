import type { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import type { VectorBackend } from "./vector-backend.js";

export type DedupResult = {
  isDuplicate: boolean;
  reason?: "exact" | "similar";
  existingId?: string;
  similarity?: number;
};

export interface DedupService {
  checkExact(content: string): DedupResult;
  checkSimilar(vector: Float32Array): Promise<DedupResult>;
  registerHash(memoryId: string, content: string): void;
}

const DEDUP_SEARCH_LIMIT = 50;

function sha256(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

export function createDedupService(
  db: Database,
  vectorBackend: VectorBackend,
  config: { dedupSimilarityThreshold: number }
): DedupService {
  try {
    db.run("ALTER TABLE memories ADD COLUMN content_hash TEXT");
  } catch {
    // column already exists — safe to ignore
  }

  return {
    checkExact(content: string): DedupResult {
      const hash = sha256(content);
      const row = db
        .prepare("SELECT id FROM memories WHERE content_hash = ?")
        .get(hash) as { id: string } | null;

      if (row) {
        return { isDuplicate: true, reason: "exact", existingId: row.id };
      }
      return { isDuplicate: false };
    },

    async checkSimilar(vector: Float32Array): Promise<DedupResult> {
      const results = await vectorBackend.search(vector, DEDUP_SEARCH_LIMIT);

      for (const result of results) {
        if (result.score >= config.dedupSimilarityThreshold) {
          return {
            isDuplicate: true,
            reason: "similar",
            existingId: result.id,
            similarity: result.score,
          };
        }
      }

      return { isDuplicate: false };
    },

    registerHash(memoryId: string, content: string): void {
      try {
        const hash = sha256(content);
        db.prepare("UPDATE memories SET content_hash = ? WHERE id = ?").run(
          hash,
          memoryId
        );
      } catch {
        // swallow DB errors silently per spec
      }
    },
  };
}
