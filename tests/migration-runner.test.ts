import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import type { Database } from "bun:sqlite";
import type { Logger } from "../src/services/logger.js";
import { createDatabase, closeDatabase } from "../src/services/database.js";
import {
  runMigrations,
  getCurrentVersion,
  hasColumn,
  type Migration,
} from "../src/services/migration-runner.js";

function createMockLogger(): Logger {
  return {
    debug: mock(() => {}),
    info: mock(() => {}),
    warn: mock(() => {}),
    error: mock(() => {}),
  };
}

describe("migration-runner", () => {
  let db: Database;
  let logger: Logger;

  beforeEach(() => {
    db = createDatabase(":memory:", 4);
    logger = createMockLogger();
  });

  afterEach(() => {
    closeDatabase(db);
  });

  it("creates schema_versions table when called with empty migrations", () => {
    const migrations: Migration[] = [];
    runMigrations(db, migrations, logger);

    const result = db
      .query("SELECT name FROM sqlite_master WHERE type='table' AND name='schema_versions'")
      .get();
    expect(result).toBeTruthy();
  });

  it("executes migrations in version order", () => {
    const migrations: Migration[] = [
      {
        version: 1,
        description: "Create test table",
        up: (database: Database) => {
          database.run("CREATE TABLE test_table_v1 (id INTEGER PRIMARY KEY)");
        },
      },
      {
        version: 2,
        description: "Add column",
        up: (database: Database) => {
          database.run("CREATE TABLE test_table_v2 (id INTEGER PRIMARY KEY)");
        },
      },
    ];

    runMigrations(db, migrations, logger);

    const v1Result = db
      .query("SELECT name FROM sqlite_master WHERE type='table' AND name='test_table_v1'")
      .get();
    const v2Result = db
      .query("SELECT name FROM sqlite_master WHERE type='table' AND name='test_table_v2'")
      .get();

    expect(v1Result).toBeTruthy();
    expect(v2Result).toBeTruthy();
  });

  it("skips already-executed migrations on second run", () => {
    const migrations: Migration[] = [
      {
        version: 1,
        description: "Create test table",
        up: (database: Database) => {
          database.run("CREATE TABLE test_table_idempotent (id INTEGER PRIMARY KEY)");
        },
      },
    ];

    runMigrations(db, migrations, logger);
    const firstVersion = getCurrentVersion(db);

    runMigrations(db, migrations, logger);
    const secondVersion = getCurrentVersion(db);

    expect(firstVersion).toBe(1);
    expect(secondVersion).toBe(1);
    expect(logger.info).toHaveBeenCalled();
  });

  it("hasColumn returns false for non-existent column", () => {
    db.run("CREATE TABLE test_col_check (id INTEGER PRIMARY KEY)");

    const hasId = hasColumn(db, "test_col_check", "id");
    const hasNonExistent = hasColumn(db, "test_col_check", "nonexistent_column");

    expect(hasId).toBe(true);
    expect(hasNonExistent).toBe(false);
  });

  it("empty migrations list is a no-op (schema_versions version stays 0)", () => {
    const migrations: Migration[] = [];
    runMigrations(db, migrations, logger);

    const version = getCurrentVersion(db);
    expect(version).toBe(0);
  });

  it("stops execution when a migration throws", () => {
    const migrations: Migration[] = [
      {
        version: 1,
        description: "First migration",
        up: (database: Database) => {
          database.run("CREATE TABLE success_table (id INTEGER PRIMARY KEY)");
        },
      },
      {
        version: 2,
        description: "Failing migration",
        up: (_database: Database) => {
          throw new Error("Migration failed");
        },
      },
      {
        version: 3,
        description: "Should not run",
        up: (database: Database) => {
          database.run("CREATE TABLE should_not_exist (id INTEGER PRIMARY KEY)");
        },
      },
    ];

    expect(() => {
      runMigrations(db, migrations, logger);
    }).toThrow();

    const successTable = db
      .query("SELECT name FROM sqlite_master WHERE type='table' AND name='success_table'")
      .get();
    const shouldNotExist = db
      .query("SELECT name FROM sqlite_master WHERE type='table' AND name='should_not_exist'")
      .get();

    expect(successTable).toBeTruthy();
    expect(shouldNotExist).toBeFalsy();
  });

  it("getCurrentVersion returns current schema version", () => {
    const migrations: Migration[] = [
      {
        version: 1,
        description: "Version 1",
        up: (database: Database) => {
          database.run("CREATE TABLE v1_table (id INTEGER PRIMARY KEY)");
        },
      },
      {
        version: 2,
        description: "Version 2",
        up: (database: Database) => {
          database.run("CREATE TABLE v2_table (id INTEGER PRIMARY KEY)");
        },
      },
    ];

    runMigrations(db, migrations, logger);

    const version = getCurrentVersion(db);
    expect(version).toBe(2);
  });
});
