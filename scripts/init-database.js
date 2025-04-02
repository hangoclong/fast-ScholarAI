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

    // Function to check if a column exists
    async function columnExists(tableName, columnName) {
      // Use db.all() as PRAGMA table_info returns multiple rows
      const result = await db.all(`PRAGMA table_info(${tableName})`); 
      // Check if result is an array and if any element has the matching name
      return Array.isArray(result) && result.some(col => col.name === columnName);
    }

    // Function to add a column if it doesn't exist
    async function addColumnIfNotExists(tableName, columnName, columnDefinition) {
      if (!(await columnExists(tableName, columnName))) {
        console.log(`Adding column ${columnName} to ${tableName}...`);
        await db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDefinition}`);
        console.log(`Column ${columnName} added.`);
      } else {
         console.log(`Column ${columnName} already exists in ${tableName}.`);
      }
    }

    // Ensure entries table exists (might be redundant but safe)
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
        deduplication_status TEXT DEFAULT 'pending', -- Added for deduplication stage
        is_duplicate INTEGER DEFAULT 0,             -- Added flag for duplicate entries
        duplicate_group_id TEXT,                    -- Added identifier for duplicate groups
        is_primary_duplicate INTEGER DEFAULT 0,     -- Added flag for the primary entry in a duplicate group
        title_screening_notes TEXT,
        abstract_screening_notes TEXT,
        notes TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        json_data TEXT
      )
    `);
    console.log('Ensured entries table exists.');

    // Add new columns if they don't exist
    await addColumnIfNotExists('entries', 'deduplication_status', "TEXT DEFAULT 'pending'");
    await addColumnIfNotExists('entries', 'is_duplicate', "INTEGER DEFAULT 0");
    await addColumnIfNotExists('entries', 'duplicate_group_id', "TEXT"); // Default is NULL
    await addColumnIfNotExists('entries', 'is_primary_duplicate', "INTEGER DEFAULT 0");

    console.log('Checked/Added deduplication columns.');
    
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
