/**
 * Database Initialization Script
 * Creates the SQLite database and runs migrations
 *
 * Usage: npx tsx scripts/init_db.ts
 */

import { initializeDatabase, closeDatabase } from '../src/data/db';

console.log('Initializing database...');

try {
  const db = initializeDatabase();
  console.log('Database initialized successfully');
  console.log('Location:', db.name);
  closeDatabase();
} catch (error) {
  console.error('Database initialization failed:', error);
  process.exit(1);
}
