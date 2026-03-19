import { Database } from "bun:sqlite";
import { existsSync } from "node:fs";
import * as sqliteVec from "sqlite-vec";

let sqliteConfigured = false;

function configureSqliteForExtensions(): void {
  if (sqliteConfigured) {
    return;
  }

  sqliteConfigured = true;

  if (process.platform !== "darwin") {
    return;
  }

  const candidatePaths = [
    process.env.OPENCODE_MEMORY_SQLITE_LIBRARY_PATH,
    "/opt/homebrew/opt/sqlite/lib/libsqlite3.dylib",
    "/usr/local/opt/sqlite3/lib/libsqlite3.dylib",
  ];

  for (const candidatePath of candidatePaths) {
    if (!candidatePath || !existsSync(candidatePath)) {
      continue;
    }

    Database.setCustomSQLite(candidatePath);
    return;
  }
}

export function createDatabase(dbPath: string, dimensions: number): Database {
  configureSqliteForExtensions();

  const db = new Database(dbPath);

  try {
    sqliteVec.load(db);
  } catch (error) {
    if (
      process.platform === "darwin" &&
      error instanceof Error &&
      error.message.includes("does not support dynamic extension loading")
    ) {
      throw new Error(
        "Failed to load sqlite-vec extension. Set OPENCODE_MEMORY_SQLITE_LIBRARY_PATH to a Homebrew SQLite dylib (for example /opt/homebrew/opt/sqlite/lib/libsqlite3.dylib).",
        { cause: error }
      );
    }

    throw error;
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS memories (
      id TEXT PRIMARY KEY,
      content TEXT NOT NULL,
      tags TEXT DEFAULT '',
      type TEXT DEFAULT 'general',
      metadata TEXT DEFAULT '{}',
      embedding_status TEXT DEFAULT 'pending',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_memories_created_at ON memories(created_at);
    CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(type);
    CREATE INDEX IF NOT EXISTS idx_memories_embedding_status ON memories(embedding_status);

    CREATE VIRTUAL TABLE IF NOT EXISTS memory_vectors USING vec0(
      id TEXT PRIMARY KEY,
      embedding float[${dimensions}]
    );
  `);

  return db;
}

export function closeDatabase(db: Database): void {
  db.close();
}
