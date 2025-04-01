const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');
const fs = require('fs');

// Database path
const DB_PATH = path.join(process.cwd(), 'literature-review.db');

console.log('Running database initialization script...');
console.log('Database path:', DB_PATH);

// Initialize database with all required tables
async function initializeDatabase() {
  try {
    // Open database connection
    const db = await open({
      filename: DB_PATH,
      driver: sqlite3.Database
    });
    
    console.log('Database connection opened');
    
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
    
    console.log('Entries table created');
    
    // Create settings table for AI prompts and API keys
    await db.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    console.log('Settings table created');
    
    // Close the database connection
    await db.close();
    console.log('Database initialization completed successfully!');
  } catch (error) {
    console.error('Error initializing database:', error);
    process.exit(1);
  }
}

// Run the initialization
initializeDatabase();
