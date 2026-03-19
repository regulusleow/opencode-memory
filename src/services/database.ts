import { Database } from "bun:sqlite";

export function createDatabase(dbPath: string, _dimensions: number): Database {
  const db = new Database(dbPath);

  db.run(`
    CREATE TABLE IF NOT EXISTS memories (
      id TEXT PRIMARY KEY,
      content TEXT NOT NULL,
      tags TEXT DEFAULT '',
      type TEXT DEFAULT 'general',
      metadata TEXT DEFAULT '{}',
      embedding_status TEXT DEFAULT 'pending',
      vector BLOB,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_memories_created_at ON memories(created_at);
    CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(type);
    CREATE INDEX IF NOT EXISTS idx_memories_embedding_status ON memories(embedding_status);
  `);

  return db;
}

export function closeDatabase(db: Database): void {
  db.close();
}
