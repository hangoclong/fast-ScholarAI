import { open } from 'sqlite';
import sqlite3 from 'sqlite3';
import path from 'path';
import { promises as fs } from 'fs';

// Database path
const DB_PATH = path.join(process.cwd(), 'literature-review.db');

// Initialize database with all required tables
export async function initializeDatabase(): Promise<void> {
  console.log('Initializing database at:', DB_PATH);
  
  // Create database directory if it doesn't exist
  const dbDir = path.dirname(DB_PATH);
  await fs.mkdir(dbDir, { recursive: true });
  
  // Open database connection
  const db = await open({
    filename: DB_PATH,
    driver: sqlite3.Database
  });
  
  try {
    // Create entries table if it doesn't exist
    await db.exec(`
      CREATE TABLE IF NOT EXISTS entries (
        id TEXT PRIMARY KEY,
        entry_type TEXT,
        title TEXT,
        author TEXT,
        year TEXT,
        journal TEXT,
        booktitle TEXT,
        publisher TEXT,
        abstract TEXT,
        doi TEXT,
        url TEXT,
        keywords TEXT,
        pages TEXT,
        volume TEXT,
        issue TEXT,
        source TEXT,
        title_screening_status TEXT DEFAULT 'pending',
        abstract_screening_status TEXT DEFAULT 'pending',
        title_screening_notes TEXT,
        abstract_screening_notes TEXT,
        notes TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        json_data TEXT
      )
    `);
    
    // Create settings table for AI prompts and API keys
    await db.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    console.log('Database initialization completed successfully');
  } catch (error) {
    console.error('Error initializing database:', error);
    throw new Error(`Failed to initialize database: ${error}`);
  } finally {
    await db.close();
  }
}

// For direct execution from command line
if (require.main === module) {
  initializeDatabase()
    .then(() => console.log('Database initialization completed'))
    .catch(err => console.error('Database initialization failed:', err));
}
