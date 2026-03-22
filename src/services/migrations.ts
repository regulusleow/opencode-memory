import { Database } from "bun:sqlite";
import { type Migration, hasColumn } from "./migration-runner.js";

export const memoryMigrations: Migration[] = [
  {
    version: 1,
    description: "add search_hit_count and last_accessed_at columns",
    up: (db: Database) => {
      if (!hasColumn(db, "memories", "search_hit_count")) {
        db.run("ALTER TABLE memories ADD COLUMN search_hit_count INTEGER DEFAULT 0");
      }
      if (!hasColumn(db, "memories", "last_accessed_at")) {
        db.run("ALTER TABLE memories ADD COLUMN last_accessed_at INTEGER");
      }
    },
  },
];
