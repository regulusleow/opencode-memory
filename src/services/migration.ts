import { Database } from "bun:sqlite";
import { getEmbeddingMeta, setEmbeddingMeta } from "./database";

export function detectDimensionMismatch(
  db: Database,
  currentModel: string,
  currentDimensions: number
): {
  needsMigration: boolean;
  storedModel: string | null;
  storedDimensions: number | null;
} {
  const { modelName: storedModel, dimensions: storedDimensions } = getEmbeddingMeta(db);

  if (storedModel === null) {
    return {
      needsMigration: false,
      storedModel: null,
      storedDimensions: null,
    };
  }

  return {
    needsMigration: storedModel !== currentModel || storedDimensions !== currentDimensions,
    storedModel,
    storedDimensions,
  };
}

export function freshStartMigration(db: Database, newModel: string, newDimensions: number): void {
  db.query("UPDATE memories SET vector = NULL, embedding_status = 'pending'").run();
  setEmbeddingMeta(db, newModel, newDimensions);
}
