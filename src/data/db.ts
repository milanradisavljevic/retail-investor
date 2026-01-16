/**
 * SQLite Database initialization and management
 * Uses better-sqlite3 for synchronous operations
 */

import Database from 'better-sqlite3';
import { readFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { join } from 'path';
import { createChildLogger } from '@/utils/logger';

const logger = createChildLogger('db');

let db: Database.Database | null = null;

function getDbPath(): string {
  const projectRoot = process.cwd();
  const dataDir = join(projectRoot, 'data');

  // Ensure data directory exists
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }

  return join(dataDir, 'privatinvestor.db');
}

export function initializeDatabase(): Database.Database {
  if (db) {
    return db;
  }

  const dbPath = getDbPath();
  const isNew = !existsSync(dbPath);

  logger.info({ dbPath, isNew }, 'Initializing database');

  db = new Database(dbPath);

  // Enable WAL mode for better concurrency
  db.pragma('journal_mode = WAL');

  // Run migrations (idempotent)
  runMigrations(db);

  // Ensure critical tables exist even if migrations are missing (e.g., test temp dirs)
  ensureCoreTables(db);

  return db;
}

function runMigrations(database: Database.Database): void {
  const migrationsDir = join(process.cwd(), 'src', 'data', 'migrations');
  if (!existsSync(migrationsDir)) {
    logger.warn({ migrationsDir }, 'Migrations directory not found');
    return;
  }

  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  logger.info({ migrationsDir, files }, 'Running database migrations');

  for (const file of files) {
    const migrationPath = join(migrationsDir, file);
    const sql = readFileSync(migrationPath, 'utf-8');
    database.exec(sql);
  }

  logger.info('Database migrations complete');
}

function ensureCoreTables(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS cache_meta (
      key TEXT PRIMARY KEY,
      last_updated INTEGER NOT NULL,
      ttl_seconds INTEGER NOT NULL,
      hit_count INTEGER DEFAULT 0
    );
  `);
}

export function getDatabase(): Database.Database {
  if (!db) {
    return initializeDatabase();
  }
  return db;
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
    logger.info('Database connection closed');
  }
}

export function resetDatabase(): void {
  closeDatabase();

  const dbPath = getDbPath();
  if (existsSync(dbPath)) {
    const { unlinkSync } = require('fs');
    unlinkSync(dbPath);
    // Also remove WAL and SHM files if they exist
    const walPath = dbPath + '-wal';
    const shmPath = dbPath + '-shm';
    if (existsSync(walPath)) unlinkSync(walPath);
    if (existsSync(shmPath)) unlinkSync(shmPath);
  }

  logger.info('Database reset complete');
}
