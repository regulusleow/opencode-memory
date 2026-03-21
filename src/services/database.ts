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

    CREATE TABLE IF NOT EXISTS embedding_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  db.run(`
    CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
      content,
      tokenize='trigram',
      content='memories',
      content_rowid='rowid'
    )
  `);

  db.run(`
    CREATE TRIGGER IF NOT EXISTS memories_fts_ai AFTER INSERT ON memories BEGIN
      INSERT INTO memories_fts(rowid, content) VALUES (new.rowid, new.content);
    END
  `);

  db.run(`
    CREATE TRIGGER IF NOT EXISTS memories_fts_ad AFTER DELETE ON memories BEGIN
      INSERT INTO memories_fts(memories_fts, rowid, content) VALUES ('delete', old.rowid, old.content);
    END
  `);

  db.run(`
    CREATE TRIGGER IF NOT EXISTS memories_fts_au AFTER UPDATE ON memories BEGIN
      INSERT INTO memories_fts(memories_fts, rowid, content) VALUES ('delete', old.rowid, old.content);
      INSERT INTO memories_fts(rowid, content) VALUES (new.rowid, new.content);
    END
  `);

  db.run(`
    INSERT INTO memories_fts(memories_fts) SELECT 'rebuild' WHERE NOT EXISTS (SELECT 1 FROM memories_fts LIMIT 1)
  `);

  return db;
}

export function getEmbeddingMeta(db: Database): {
  modelName: string | null;
  dimensions: number | null;
} {
  const modelRow = db.query("SELECT value FROM embedding_meta WHERE key = 'model_name'").get() as
    | { value: string }
    | null;
  const dimensionsRow = db.query("SELECT value FROM embedding_meta WHERE key = 'dimensions'").get() as
    | { value: string }
    | null;

  const dimensionsValue = dimensionsRow?.value;
  const dimensions = dimensionsValue === undefined ? null : Number.parseInt(dimensionsValue, 10);

  return {
    modelName: modelRow?.value ?? null,
    dimensions: Number.isNaN(dimensions) ? null : dimensions,
  };
}

export function setEmbeddingMeta(db: Database, model: string, dimensions: number): void {
  db.query("INSERT OR REPLACE INTO embedding_meta (key, value) VALUES (?, ?)").run(
    "model_name",
    model
  );
  db.query("INSERT OR REPLACE INTO embedding_meta (key, value) VALUES (?, ?)").run(
    "dimensions",
    String(dimensions)
  );
}

export function closeDatabase(db: Database): void {
  db.close();
}
