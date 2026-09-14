// ============================================
// DATABASE CONNECTION & CONFIGURATION
// ============================================

import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from './schema';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Database file path - can be overridden via environment variable
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../../payroll.db');

// Create SQLite database connection
const sqlite = new Database(DB_PATH, {
  // Enable WAL mode for better concurrency
  // fileMustExist: false, // Allow creating new database
});

// Enable WAL mode for better concurrent access
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');
sqlite.pragma('synchronous = NORMAL');
sqlite.pragma('cache_size = -32768'); // 32MB cache

// Create Drizzle instance with schema
export const db = drizzle(sqlite, { schema });

// Export schema for migrations
export { schema };

// Type helper for transaction
export type Database = typeof db;
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

// Helper to run migrations
export async function runMigrations() {
  const { migrate } = await import('drizzle-orm/better-sqlite3/migrator');
  await migrate(db, { migrationsFolder: path.join(__dirname, '../migrations') });
}

// Health check
export function checkConnection(): boolean {
  try {
    sqlite.prepare('SELECT 1').get();
    return true;
  } catch {
    return false;
  }
}

// Close connection (for graceful shutdown)
export function closeConnection() {
  sqlite.close();
}

export default db;