import { Database } from "bun:sqlite";
import type { Logger } from "./logger.js";

export interface Migration {
  version: number;
  description: string;
  up: (db: Database) => void;
}

export function runMigrations(db: Database, migrations: Migration[], logger: Logger): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS schema_versions (
      version INTEGER NOT NULL DEFAULT 0
    )
  `);

  const existing = db.query("SELECT COUNT(*) as count FROM schema_versions").get() as
    | { count: number }
    | null;

  if (!existing || existing.count === 0) {
    db.query("INSERT INTO schema_versions (version) VALUES (0)").run();
  }

  const versionRow = db.query("SELECT version FROM schema_versions LIMIT 1").get() as
    | { version: number }
    | null;
  const currentVersion = versionRow?.version ?? 0;

  const pendingMigrations = migrations
    .sort((a, b) => a.version - b.version)
    .filter((m) => m.version > currentVersion);

  for (const migration of pendingMigrations) {
    try {
      migration.up(db);
      db.query("UPDATE schema_versions SET version = ?").run(migration.version);
      logger.info(`Migration ${migration.version}: ${migration.description}`);
    } catch (error) {
      logger.error(`Migration ${migration.version} failed`, {
        description: migration.description,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}

export function getCurrentVersion(db: Database): number {
  const result = db.query("SELECT version FROM schema_versions LIMIT 1").get() as
    | { version: number }
    | null;
  return result?.version ?? 0;
}

export function hasColumn(db: Database, table: string, column: string): boolean {
  const columns = db.query(`PRAGMA table_info(${table})`).all() as
    | Array<{ name: string }>
    | null;
  if (!columns) return false;
  return columns.some((col) => col.name === column);
}
