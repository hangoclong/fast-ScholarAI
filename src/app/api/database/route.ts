import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import { BibEntry, ScreeningStatus } from '@/app/types';
import { randomBytes } from 'crypto'; // Import for random suffix generation
import { findPotentialDuplicates } from '../../utils/deduplication'; // Corrected import path

// Database path
const DB_PATH = path.join(process.cwd(), 'literature-review.db');

// Get database connection
async function getDbConnection(): Promise<Database> {
  // Ensure the directory exists (useful if DB_PATH is nested)
  // await fs.mkdir(path.dirname(DB_PATH), { recursive: true });
  return open({
    filename: DB_PATH,
    driver: sqlite3.Database
  });
}

// Function to apply necessary schema migrations (e.g., adding columns)
async function applySchemaMigrations(): Promise<void> {
  let db: Database | null = null;
  try {
    db = await getDbConnection();
    console.log('Applying schema migrations...');

    // Add title_screening_confidence column if it doesn't exist
    try {
      await db.exec('ALTER TABLE entries ADD COLUMN title_screening_confidence REAL');
      console.log('Successfully added title_screening_confidence column.');
    } catch (e: any) {
      if (e.message?.includes('duplicate column name')) {
        // This is expected if the column already exists, ignore.
        console.log('Column title_screening_confidence already exists.');
      } else {
        // Re-throw other errors
        console.error('Error adding title_screening_confidence column:', e);
        throw e;
      }
    }

    // Add abstract_screening_confidence column if it doesn't exist
    try {
      await db.exec('ALTER TABLE entries ADD COLUMN abstract_screening_confidence REAL');
      console.log('Successfully added abstract_screening_confidence column.');
    } catch (e: any) {
      if (e.message?.includes('duplicate column name')) {
        // This is expected if the column already exists, ignore.
        console.log('Column abstract_screening_confidence already exists.');
      } else {
        // Re-throw other errors
        console.error('Error adding abstract_screening_confidence column:', e);
        throw e;
      }
    }

    console.log('Schema migrations check complete.');
  } catch (error) {
    console.error('Error during schema migration:', error);
    // Decide if this should be a fatal error or just logged
    // For now, re-throwing to indicate a potential problem
    throw new Error(`Failed to apply database schema migrations: ${error instanceof Error ? error.message : 'Unknown error'}`);
  } finally {
    if (db) {
      try {
        await db.close();
        console.log('Database connection closed after migrations.');
      } catch (closeError) {
        console.error('Error closing database connection after migrations:', closeError);
      }
    }
  }
}


// Initialize database (Creates tables if they don't exist)
async function initDatabase(): Promise<void> {
  let db: Database | null = null;
  try {
    db = await getDbConnection();
    console.log('Initializing database (creating tables if not exist)...');

    // Create entries table if it doesn't exist - include all columns from the start
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
        deduplication_status TEXT DEFAULT 'pending',
        is_duplicate INTEGER DEFAULT 0,
        duplicate_group_id TEXT,
        is_primary_duplicate INTEGER DEFAULT 0,
        title_screening_notes TEXT,
        title_screening_confidence REAL,
        abstract_screening_notes TEXT,
        abstract_screening_confidence REAL,
        notes TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        json_data TEXT
      )
    `);
    console.log('Ensured entries table exists.');

    // Create settings table
    await db.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('Ensured settings table exists.');

    // After ensuring tables exist, apply migrations (like adding columns)
    // This is slightly redundant if CREATE TABLE includes all columns, but safe.
    await applySchemaMigrations(); // Call migration logic here as well

    console.log('Database initialization complete.');

  } catch (error) {
    console.error('Error during database initialization:', error);
    throw new Error('Failed to initialize database');
  } finally {
    if (db) {
      try {
        await db.close();
        console.log('Database connection closed after init.');
      } catch (closeError) {
        console.error('Error closing database connection after init:', closeError);
      }
    }
  }
}

// Helper function to generate a random alphanumeric suffix
function generateRandomSuffix(length: number = 6): string {
  const characters = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  const charactersLength = characters.length;
  try {
    const buffer = randomBytes(length);
    for (let i = 0; i < length; i++) {
      result += characters.charAt(buffer[i] % charactersLength);
    }
  } catch (e) {
    console.warn("crypto.randomBytes not available, falling back to Math.random for suffix generation.");
    for (let i = 0; i < length; i++) {
      result += characters.charAt(Math.floor(Math.random() * charactersLength));
    }
  }
  return result;
}

// Save entries to database
async function saveEntries(entries: BibEntry[], source: string): Promise<void> {
  await applySchemaMigrations(); // Ensure schema is up-to-date before saving
  const db = await getDbConnection();
  try {
    await db.run('BEGIN TRANSACTION');
    const insertStmt = await db.prepare(
      `INSERT INTO entries (
        id, entry_type, title, author, year, journal, booktitle, publisher,
        abstract, doi, url, keywords, pages, volume, issue, source, json_data
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    for (const entry of entries) {
      const { ENTRYTYPE, title, author, year, journal, booktitle, publisher, abstract, doi, url, keywords, pages, volume, number } = entry;
      let currentId = entry.ID;
      const remainingFields: Record<string, any> = {};
      for (const key in entry) {
        if (!['ID', 'ENTRYTYPE', 'title', 'author', 'year', 'journal', 'booktitle', 'publisher', 'abstract', 'doi', 'url', 'keywords', 'pages', 'volume', 'number', 'title_screening_status', 'abstract_screening_status'].includes(key)) {
          remainingFields[key] = entry[key as keyof BibEntry];
        }
      }
      const jsonData = JSON.stringify(remainingFields);

      try {
        await insertStmt.run(currentId, ENTRYTYPE, title, author, year, journal, booktitle, publisher, abstract, doi, url, keywords, pages, volume, number, source, jsonData);
      } catch (error: any) {
        if (error.code === 'SQLITE_CONSTRAINT_PRIMARYKEY' || (error.code === 'SQLITE_CONSTRAINT' && error.message.includes('UNIQUE constraint failed: entries.id'))) {
          console.warn(`Duplicate ID detected: ${currentId}. Attempting insertion with suffix.`);
          const suffix = generateRandomSuffix(4);
          const originalId = currentId;
          currentId = `${originalId}_${suffix}`;
          try {
            await insertStmt.run(currentId, ENTRYTYPE, title, author, year, journal, booktitle, publisher, abstract, doi, url, keywords, pages, volume, number, source, jsonData);
            console.log(`Successfully inserted entry with modified ID: ${currentId} (original: ${originalId})`);
          } catch (retryError: any) {
            console.error(`Failed to insert entry with modified ID ${currentId} (original: ${originalId}):`, retryError);
            throw retryError;
          }
        } else {
          console.error(`Non-duplicate error during insertion for ID ${currentId}:`, error);
          throw error;
        }
      }
    }
    await insertStmt.finalize();
    await db.run('COMMIT');
    console.log(`Successfully saved/updated ${entries.length} entries from source: ${source}`);
  } catch (error) {
    console.error('Error saving entries, rolling back transaction:', error);
    try { await db.run('ROLLBACK'); } catch (rollbackError) { console.error('Error rolling back transaction:', rollbackError); }
    throw new Error(`Failed to save entries: ${error instanceof Error ? error.message : 'Unknown error'}`);
  } finally {
    try { await db.close(); } catch (closeError) { console.error('Error closing database connection:', closeError); }
  }
}

// Get all entries with ALL details (for export)
async function getAllEntriesWithDetails(): Promise<any[]> {
  await applySchemaMigrations(); // Ensure schema is up-to-date
  const db = await getDbConnection();
  try {
    const rows = await db.all('SELECT * FROM entries ORDER BY created_at DESC');
    return rows;
  } catch (error) {
    console.error('Error getting all entries with details:', error);
    throw new Error('Failed to get all entries with details');
  } finally {
    await db.close();
  }
}

// Get all entries (potentially simplified for UI)
async function getAllEntries(): Promise<BibEntry[]> {
  await applySchemaMigrations(); // Ensure schema is up-to-date
  const db = await getDbConnection();
  try {
    const rows = await db.all('SELECT * FROM entries');
    return rows.map(convertRowToBibEntry);
  } catch (error) {
    console.error('Error getting all entries:', error);
    throw new Error('Failed to get all entries');
  } finally {
    await db.close();
  }
}

// Get entries for title screening (paginated)
async function getTitleScreeningEntries(page: number = 1, pageSize: number = 10): Promise<{ entries: BibEntry[], totalCount: number }> {
  await applySchemaMigrations(); // Ensure schema is up-to-date
  const db = await getDbConnection();
  try {
    const offset = (page - 1) * pageSize;
    const baseCondition = "deduplication_status != 'excluded'";

    // Get total count matching the criteria
    const totalResult = await db.get<{ count: number }>(`SELECT COUNT(*) as count FROM entries WHERE ${baseCondition}`);
    const totalCount = totalResult?.count || 0;

    // Get paginated entries
    const rows = await db.all(`
      SELECT * FROM entries 
      WHERE ${baseCondition} 
      ORDER BY year DESC, id ASC 
      LIMIT ? OFFSET ?
    `, [pageSize, offset]);
    
    const entries = rows.map(convertRowToBibEntry);
    
    return { entries, totalCount };
  } catch (error) {
    console.error('Error getting paginated title screening entries:', error);
    throw new Error('Failed to get paginated title screening entries');
  } finally {
    await db.close();
  }
}

// Get entries for abstract screening (paginated)
async function getAbstractScreeningEntries(page: number = 1, pageSize: number = 10): Promise<{ entries: BibEntry[], totalCount: number }> {
  await applySchemaMigrations(); // Ensure schema is up-to-date
  const db = await getDbConnection();
  try {
    const offset = (page - 1) * pageSize;
    // Condition: Included in title screening AND not excluded by deduplication
    const baseCondition = "title_screening_status = 'included' AND deduplication_status != 'excluded'"; 

    // Get total count matching the criteria
    const totalResult = await db.get<{ count: number }>(`SELECT COUNT(*) as count FROM entries WHERE ${baseCondition}`);
    const totalCount = totalResult?.count || 0;

    // Get paginated entries
    const rows = await db.all(`
      SELECT * FROM entries 
      WHERE ${baseCondition} 
      ORDER BY year DESC, id ASC 
      LIMIT ? OFFSET ?
    `, [pageSize, offset]);
    
    const entries = rows.map(convertRowToBibEntry);
    
    return { entries, totalCount };
  } catch (error) {
    console.error('Error getting paginated abstract screening entries:', error);
    throw new Error('Failed to get paginated abstract screening entries');
  } finally {
    await db.close();
  }
}

// Get included entries
async function getIncludedEntries(): Promise<BibEntry[]> {
  await applySchemaMigrations(); // Ensure schema is up-to-date
  const db = await getDbConnection();
  try {
    const rows = await db.all(`SELECT * FROM entries WHERE title_screening_status = 'included' AND abstract_screening_status = 'included' ORDER BY year DESC`);
    return rows.map(convertRowToBibEntry);
  } catch (error) {
    console.error('Error getting included entries:', error);
    throw new Error('Failed to get included entries');
  } finally {
    await db.close();
  }
}

// Get included literature (entries included in either title or abstract screening, excluding duplicates)
async function getIncludedLiteratureEntries(): Promise<BibEntry[]> {
  await applySchemaMigrations(); // Ensure schema is up-to-date
  const db = await getDbConnection();
  try {
    const rows = await db.all(`SELECT * FROM entries WHERE (title_screening_status = 'included' OR abstract_screening_status = 'included') AND deduplication_status != 'excluded' ORDER BY year DESC`);
    return rows.map(convertRowToBibEntry);
  } catch (error) {
    console.error('Error getting included literature entries:', error);
    throw new Error('Failed to get included literature entries');
  } finally {
    await db.close();
  }
}

// Batch update screening status
async function updateScreeningStatusBatch(
  updates: { id: string; screeningType: 'title' | 'abstract'; status: ScreeningStatus; notes?: string; confidence?: number }[]
): Promise<{ successCount: number; errorCount: number; errors: { id: string; message: string }[] }> {
  // Migration check happens in the POST handler before calling this
  const db = await getDbConnection();
  let successCount = 0;
  let errorCount = 0;
  const errors: { id: string; message: string }[] = [];

  try {
    await db.run('BEGIN TRANSACTION');
    // Prepare a single statement for reuse
    const stmt = await db.prepare(`
      UPDATE entries
      SET
        title_screening_status = CASE WHEN ? = 'title' THEN ? ELSE title_screening_status END,
        abstract_screening_status = CASE WHEN ? = 'abstract' THEN ? ELSE abstract_screening_status END,
        title_screening_notes = CASE WHEN ? = 'title' THEN ? ELSE title_screening_notes END,
        abstract_screening_notes = CASE WHEN ? = 'abstract' THEN ? ELSE abstract_screening_notes END,
        title_screening_confidence = CASE WHEN ? = 'title' THEN ? ELSE title_screening_confidence END,
        abstract_screening_confidence = CASE WHEN ? = 'abstract' THEN ? ELSE abstract_screening_confidence END
      WHERE id = ?
    `);

    for (const update of updates) {
      const { id, screeningType, status, notes, confidence } = update;
      try {
        const result = await stmt.run(
          screeningType, status, // For title_screening_status CASE
          screeningType, status, // For abstract_screening_status CASE
          screeningType, notes || null, // For title_screening_notes CASE
          screeningType, notes || null, // For abstract_screening_notes CASE
          screeningType, confidence ?? null, // For title_screening_confidence CASE
          screeningType, confidence ?? null, // For abstract_screening_confidence CASE
          id // WHERE clause
        );
        // Safely check if result exists and result.changes is a positive number
        if (result && typeof result.changes === 'number' && result.changes > 0) {
          successCount++;
        } else {
          console.warn(`Server: No changes made during batch update for entry ${id}. Entry might not exist.`);
          // Optionally count as error or just log
        }
      } catch (itemError: any) {
        console.error(`Server: Error updating entry ${id} during batch:`, itemError);
        errorCount++;
        errors.push({ id, message: itemError.message || 'Unknown error' });
        // Continue processing other items in the batch
      }
    }

    await stmt.finalize();
    await db.run('COMMIT');
    console.log(`Server: Batch update complete. Success: ${successCount}, Errors: ${errorCount}`);

  } catch (error) {
    console.error(`Server: Error during batch update transaction:`, error);
    await db.run('ROLLBACK'); // Rollback on transaction-level error
    // Throw a generic error for the whole batch if the transaction fails
    throw new Error(`Failed batch update transaction: ${error instanceof Error ? error.message : 'Unknown error'}`);
  } finally {
    await db.close();
  }
  return { successCount, errorCount, errors };
}


// Update screening status (Single entry - kept for manual updates)
async function updateScreeningStatus(
  id: string,
  screeningType: 'title' | 'abstract',
  status: ScreeningStatus,
  notes?: string,
  confidence?: number
): Promise<void> {
  // Migration check happens in the POST handler before calling this
  const db = await getDbConnection();
  try {
    console.log(`Server: Updating ${screeningType} screening for entry ${id} to status: ${status} with confidence: ${confidence}`);
    const statusField = screeningType === 'title' ? 'title_screening_status' : 'abstract_screening_status';
    const notesField = screeningType === 'title' ? 'title_screening_notes' : 'abstract_screening_notes';
    const confidenceField = screeningType === 'title' ? 'title_screening_confidence' : 'abstract_screening_confidence';

    const entry = await db.get('SELECT id FROM entries WHERE id = ?', [id]);
    if (!entry) {
      console.error(`Server: Entry with ID ${id} not found`);
      throw new Error(`Entry with ID ${id} not found`);
    }

    // Update query now assumes columns exist
    const query = `UPDATE entries SET ${statusField} = ?, ${notesField} = ?, ${confidenceField} = ? WHERE id = ?`;
    const params = [status, notes || null, confidence ?? null, id]; // Use null for confidence if undefined/null

    console.log('Server: Executing query:', query);
    console.log('Server: With parameters:', params);

    const result = await db.run(query, params);

    console.log('Server: Update result:', result);
    console.log(`Server: Changes made: ${result.changes}`);
    if (result.changes === 0) {
      console.warn(`Server: No changes made when updating entry ${id}. Entry might not exist or values unchanged.`);
    }
  } catch (error) {
    console.error(`Server: Error updating ${screeningType} screening status:`, error);
    console.error('Server: Error details:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
    throw new Error(`Failed to update ${screeningType} screening status: ${error instanceof Error ? error.message : 'Unknown error'}`);
  } finally {
    await db.close();
  }
}

// Clear database
async function clearDatabase(): Promise<void> {
  const db = await getDbConnection();
  try {
    await db.run('BEGIN TRANSACTION');
    await db.run('DELETE FROM entries');
    console.log('Entries table cleared');
    // await db.run('DELETE FROM settings'); // Keep settings
    await db.run('COMMIT');
    console.log('Database cleared successfully');
  } catch (error) {
    await db.run('ROLLBACK');
    console.error('Error clearing database:', error);
    throw new Error('Failed to clear database');
  } finally {
    await db.close();
  }
}

// Get database statistics
async function getDatabaseStats(): Promise<{
  total: number;
  titleScreening: { pending: number; included: number; excluded: number; maybe: number };
  abstractScreening: { pending: number; included: number; excluded: number; maybe: number };
  deduplication: { groupsPending: number; entriesPending: number; excluded: number; };
}> {
  await applySchemaMigrations(); // Ensure schema is up-to-date
  const db = await getDbConnection();
  try {
    const baseCondition = "deduplication_status != 'excluded'";
    const totalResult = await db.get(`SELECT COUNT(*) as count FROM entries WHERE ${baseCondition}`);
    const titlePendingResult = await db.get(`SELECT COUNT(*) as count FROM entries WHERE title_screening_status = 'pending' AND ${baseCondition}`);
    const titleIncludedResult = await db.get(`SELECT COUNT(*) as count FROM entries WHERE title_screening_status = 'included' AND ${baseCondition}`);
    const titleExcludedResult = await db.get(`SELECT COUNT(*) as count FROM entries WHERE title_screening_status = 'excluded' AND ${baseCondition}`);
    const titleMaybeResult = await db.get(`SELECT COUNT(*) as count FROM entries WHERE title_screening_status = 'maybe' AND ${baseCondition}`);
    const abstractPendingResult = await db.get(`SELECT COUNT(*) as count FROM entries WHERE title_screening_status = 'included' AND abstract_screening_status = 'pending' AND ${baseCondition}`);
    const abstractIncludedResult = await db.get(`SELECT COUNT(*) as count FROM entries WHERE title_screening_status = 'included' AND abstract_screening_status = 'included' AND ${baseCondition}`);
    const abstractExcludedResult = await db.get(`SELECT COUNT(*) as count FROM entries WHERE title_screening_status = 'included' AND abstract_screening_status = 'excluded' AND ${baseCondition}`);
    const abstractMaybeResult = await db.get(`SELECT COUNT(*) as count FROM entries WHERE title_screening_status = 'included' AND abstract_screening_status = 'maybe' AND ${baseCondition}`);
    const dedupGroupsPendingResult = await db.get(`SELECT COUNT(DISTINCT duplicate_group_id) as count FROM entries WHERE duplicate_group_id IS NOT NULL AND deduplication_status = 'pending'`);
    const dedupEntriesPendingResult = await db.get(`SELECT COUNT(*) as count FROM entries WHERE duplicate_group_id IS NOT NULL AND deduplication_status = 'pending'`);
    const dedupExcludedResult = await db.get(`SELECT COUNT(*) as count FROM entries WHERE deduplication_status = 'excluded'`);

    return {
      total: totalResult?.count || 0,
      titleScreening: { pending: titlePendingResult?.count || 0, included: titleIncludedResult?.count || 0, excluded: titleExcludedResult?.count || 0, maybe: titleMaybeResult?.count || 0 },
      abstractScreening: { pending: abstractPendingResult?.count || 0, included: abstractIncludedResult?.count || 0, excluded: abstractExcludedResult?.count || 0, maybe: abstractMaybeResult?.count || 0 },
      deduplication: { groupsPending: dedupGroupsPendingResult?.count || 0, entriesPending: dedupEntriesPendingResult?.count || 0, excluded: dedupExcludedResult?.count || 0 }
    };
  } catch (error) {
    console.error('Error getting database stats:', error);
    throw new Error('Failed to get database stats');
  } finally {
    await db.close();
  }
}

// Save AI prompt
async function saveAIPrompt(screeningType: 'title' | 'abstract', prompt: string): Promise<void> {
  const db = await getDbConnection();
  try {
    await db.run(`INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)`, [`ai_prompt_${screeningType}`, prompt]);
  } catch (error) {
    console.error(`Error saving ${screeningType} prompt:`, error);
    throw new Error(`Failed to save ${screeningType} prompt`);
  } finally {
    await db.close();
  }
}

// Get AI prompt
async function getAIPrompt(screeningType: 'title' | 'abstract'): Promise<string | null> {
  const db = await getDbConnection();
  try {
    const result = await db.get(`SELECT value FROM settings WHERE key = ?`, [`ai_prompt_${screeningType}`]);
    return result ? result.value : null;
  } catch (error) {
    console.error(`Error getting ${screeningType} prompt:`, error);
    throw new Error(`Failed to get ${screeningType} prompt`);
  } finally {
    await db.close();
  }
}

// Save API key
async function saveAPIKey(service: string, apiKey: string): Promise<void> {
  const db = await getDbConnection();
  try {
    await db.run(`INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)`, [`api_key_${service}`, apiKey]);
  } catch (error) {
    console.error(`Error saving ${service} API key:`, error);
    throw new Error(`Failed to save ${service} API key`);
  } finally {
    await db.close();
  }
}

// Get API key
async function getAPIKey(service: string): Promise<string | null> {
  const db = await getDbConnection();
  try {
    const result = await db.get(`SELECT value FROM settings WHERE key = ?`, [`api_key_${service}`]);
    return result ? result.value : null;
  } catch (error) {
    console.error(`Error getting ${service} API key:`, error);
    throw new Error(`Failed to get ${service} API key`);
  } finally {
    await db.close();
  }
}

// Helper function to convert a database row to a BibEntry
function convertRowToBibEntry(row: any): BibEntry {
  return {
    ID: row.id,
    ENTRYTYPE: row.entry_type,
    title: row.title,
    author: row.author,
    year: row.year,
    journal: row.journal,
    booktitle: row.booktitle,
    publisher: row.publisher,
    abstract: row.abstract,
    doi: row.doi,
    url: row.url,
    keywords: row.keywords,
    pages: row.pages,
    volume: row.volume,
    number: row.issue,
    title_screening_status: row.title_screening_status as ScreeningStatus,
    abstract_screening_status: row.abstract_screening_status as ScreeningStatus,
    deduplication_status: row.deduplication_status as ScreeningStatus,
    is_duplicate: row.is_duplicate,
    duplicate_group_id: row.duplicate_group_id,
    is_primary_duplicate: row.is_primary_duplicate,
    title_screening_notes: row.title_screening_notes,
    abstract_screening_notes: row.abstract_screening_notes, // Added missing mapping
    // Include confidence scores if they exist in the row
    ...(row.title_screening_confidence !== undefined && { title_screening_confidence: row.title_screening_confidence }),
    ...(row.abstract_screening_confidence !== undefined && { abstract_screening_confidence: row.abstract_screening_confidence }),
    notes: row.notes,
    source: row.source,
    ...JSON.parse(row.json_data || '{}')
  };
}

// Get entries for deduplication review (grouped by duplicate_group_id, paginated)
async function getDeduplicationEntries(page: number = 1, pageSize: number = 50): Promise<{ groups: Record<string, BibEntry[]>, totalGroups: number }> {
  await applySchemaMigrations(); // Ensure schema is up-to-date
  const db = await getDbConnection();
  try {
    const offset = (page - 1) * pageSize;
    const totalResult = await db.get(`SELECT COUNT(DISTINCT duplicate_group_id) as count FROM entries WHERE duplicate_group_id IS NOT NULL AND deduplication_status = 'pending'`);
    const totalGroups = totalResult?.count || 0;
    if (totalGroups === 0) return { groups: {}, totalGroups: 0 };

    const groupIdsResult = await db.all(`SELECT DISTINCT duplicate_group_id FROM entries WHERE duplicate_group_id IS NOT NULL AND deduplication_status = 'pending' ORDER BY duplicate_group_id LIMIT ? OFFSET ?`, [pageSize, offset]);
    const groupIds = groupIdsResult.map(row => row.duplicate_group_id);
    if (groupIds.length === 0) return { groups: {}, totalGroups: totalGroups };

    const placeholders = groupIds.map(() => '?').join(',');
    const rows = await db.all(`SELECT * FROM entries WHERE duplicate_group_id IN (${placeholders}) AND deduplication_status = 'pending' ORDER BY duplicate_group_id, LENGTH(abstract) DESC, id`, groupIds);

    const groupedEntries: Record<string, BibEntry[]> = {};
    for (const row of rows) {
      const entry = convertRowToBibEntry(row);
      const groupId = entry.duplicate_group_id;
      if (groupId) {
        if (!groupedEntries[groupId]) groupedEntries[groupId] = [];
        groupedEntries[groupId].push(entry);
      }
    }
    return { groups: groupedEntries, totalGroups: totalGroups };
  } catch (error) {
    console.error('Error getting paginated deduplication entries:', error);
    throw new Error('Failed to get paginated deduplication entries');
  } finally {
    await db.close();
  }
}

// Run the deduplication process across all entries
async function runDeduplicationProcess(): Promise<{ count: number }> {
  await applySchemaMigrations(); // Ensure schema is up-to-date
  console.log("Starting deduplication process...");
  const allEntries = await getAllEntries();
  console.log(`Fetched ${allEntries.length} entries for deduplication check.`);
  const entriesWithDupInfo = findPotentialDuplicates(allEntries);
  const duplicatesToUpdate = entriesWithDupInfo.filter((e: BibEntry) => e.is_duplicate === 1 && e.duplicate_group_id);
  console.log(`Found ${duplicatesToUpdate.length} entries marked as potential duplicates.`);
  if (duplicatesToUpdate.length === 0) return { count: 0 };

  const db = await getDbConnection();
  try {
    await db.run('BEGIN TRANSACTION');
    const stmt = await db.prepare(`UPDATE entries SET duplicate_group_id = ?, is_duplicate = ?, is_primary_duplicate = ?, deduplication_status = 'pending' WHERE id = ?`);
    let updatedCount = 0;
    for (const entry of duplicatesToUpdate) {
      const result = await stmt.run(entry.duplicate_group_id, entry.is_duplicate, entry.is_primary_duplicate, entry.ID);
      if (result.changes && result.changes > 0) updatedCount++;
    }
    await stmt.finalize();
    await db.run('COMMIT');
    console.log(`Successfully updated ${updatedCount} entries in the database with deduplication info.`);
    return { count: updatedCount };
  } catch (error) {
    await db.run('ROLLBACK');
    console.error('Error updating database with duplicate information:', error);
    throw new Error(`Failed to update database with duplicates: ${error instanceof Error ? error.message : 'Unknown error'}`);
  } finally {
    await db.close();
  }
}

// Update deduplication status for entries (manual review decisions)
async function updateDeduplicationStatus(updates: { id: string; status: ScreeningStatus; is_duplicate?: number; is_primary?: number }[]): Promise<void> {
  await applySchemaMigrations(); // Ensure schema is up-to-date
  const db = await getDbConnection();
  try {
    await db.run('BEGIN TRANSACTION');
    const stmt = await db.prepare(`UPDATE entries SET deduplication_status = ?, is_duplicate = COALESCE(?, is_duplicate), is_primary_duplicate = COALESCE(?, is_primary_duplicate) WHERE id = ?`);
    for (const update of updates) {
      await stmt.run(update.status, update.is_duplicate, update.is_primary, update.id);
    }
    await stmt.finalize();
    await db.run('COMMIT');
    console.log(`Successfully updated deduplication status for ${updates.length} entries.`);
  } catch (error) {
    await db.run('ROLLBACK');
    console.error('Error updating deduplication status:', error);
    throw new Error(`Failed to update deduplication status: ${error instanceof Error ? error.message : 'Unknown error'}`);
  } finally {
    await db.close();
  }
}

// Reset the title screening status for all entries
async function resetTitleScreeningStatus(): Promise<void> {
  await applySchemaMigrations(); // Ensure schema is up-to-date
  const db = await getDbConnection();
  try {
    await db.run('BEGIN TRANSACTION');
    const result = await db.run(`UPDATE entries SET title_screening_status = 'pending', title_screening_notes = NULL, title_screening_confidence = NULL`); // Also reset confidence
    console.log(`Reset title screening status for ${result.changes} entries.`);
    await db.run('COMMIT');
  } catch (error) {
    await db.run('ROLLBACK');
    console.error('Error resetting title screening status:', error);
    throw new Error(`Failed to reset title screening status: ${error instanceof Error ? error.message : 'Unknown error'}`);
  } finally {
    await db.close();
  }
}

// Reset the abstract screening status for all entries
async function resetAbstractScreeningStatus(): Promise<void> {
  await applySchemaMigrations(); // Ensure schema is up-to-date
  const db = await getDbConnection();
  try {
    await db.run('BEGIN TRANSACTION');
    // Only reset abstract status for entries that were included in title screening
    // This prevents resetting abstracts for entries that never reached this stage.
    // Also reset notes and confidence.
    const result = await db.run(`
      UPDATE entries 
      SET 
        abstract_screening_status = 'pending', 
        abstract_screening_notes = NULL, 
        abstract_screening_confidence = NULL 
      WHERE title_screening_status = 'included' 
        AND deduplication_status != 'excluded'
    `); 
    console.log(`Reset abstract screening status for ${result.changes} entries.`);
    await db.run('COMMIT');
  } catch (error) {
    await db.run('ROLLBACK');
    console.error('Error resetting abstract screening status:', error);
    throw new Error(`Failed to reset abstract screening status: ${error instanceof Error ? error.message : 'Unknown error'}`);
  } finally {
    await db.close();
  }
}

// --- API Route Handlers ---

// Ensure database exists and schema is up-to-date before handling any request
async function ensureDbReady() {
  try {
    await fs.access(DB_PATH);
    // If DB exists, ensure schema is up-to-date
    await applySchemaMigrations();
  } catch (error) {
    // If DB doesn't exist, initialize it (which includes migrations)
    console.log('Database file not found, initializing...');
    await initDatabase();
  }
}

export async function GET(request: NextRequest) {
  console.log('Database API - GET request received');
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');
  console.log('Database API - Action:', action);

  try {
    await ensureDbReady(); // Ensure DB and schema are ready

    switch (action) {
      case 'init': // Keep init action for explicit initialization if needed
        // ensureDbReady already handles initialization if needed
        console.log('Database API - Database already initialized/checked.');
        return NextResponse.json({ success: true, message: 'Database initialized/checked.' });
      case 'stats':
        console.log('Database API - Getting database stats...');
        const stats = await getDatabaseStats();
        console.log('Database API - Stats retrieved:', stats);
        return NextResponse.json({ success: true, data: stats });
      case 'all':
        console.log('Database API - Getting all entries...');
        const allEntries = await getAllEntries();
        console.log(`Database API - Retrieved ${allEntries.length} entries`);
        return NextResponse.json({ success: true, data: allEntries });
      case 'title-screening':
        console.log('Database API - Getting title screening entries (paginated)...');
        const tsPage = parseInt(searchParams.get('page') || '1', 10);
        const tsPageSize = parseInt(searchParams.get('pageSize') || '10', 10);
        console.log(`Database API - Page: ${tsPage}, PageSize: ${tsPageSize}`);
        const titleScreeningResult = await getTitleScreeningEntries(tsPage, tsPageSize);
        console.log(`Database API - Retrieved ${titleScreeningResult.entries.length} title screening entries for page ${tsPage}, total: ${titleScreeningResult.totalCount}`);
        // Return data in the expected nested format { entries: [], totalCount: number }
        return NextResponse.json({ success: true, data: titleScreeningResult }); 
      case 'abstract-screening':
        console.log('Database API - Getting abstract screening entries (paginated)...');
        const asPage = parseInt(searchParams.get('page') || '1', 10);
        const asPageSize = parseInt(searchParams.get('pageSize') || '10', 10);
        console.log(`Database API - Page: ${asPage}, PageSize: ${asPageSize}`);
        const abstractScreeningResult = await getAbstractScreeningEntries(asPage, asPageSize);
        console.log(`Database API - Retrieved ${abstractScreeningResult.entries.length} abstract screening entries for page ${asPage}, total: ${abstractScreeningResult.totalCount}`);
        // Return data in the expected nested format { entries: [], totalCount: number }
        return NextResponse.json({ success: true, data: abstractScreeningResult });
      case 'included':
        console.log('Database API - Getting included entries...');
        const includedEntries = await getIncludedEntries();
        console.log(`Database API - Retrieved ${includedEntries.length} included entries (both stages)`);
        return NextResponse.json({ success: true, data: includedEntries });
      case 'included-literature':
        console.log('Database API - Getting included literature entries (either stage)...');
        const includedLiteratureEntries = await getIncludedLiteratureEntries();
        console.log(`Database API - Retrieved ${includedLiteratureEntries.length} included literature entries`);
        return NextResponse.json({ success: true, entries: includedLiteratureEntries });
      case 'getPrompt':
        console.log('Database API - Getting AI prompt...');
        const promptType = searchParams.get('type') as 'title' | 'abstract';
        if (!promptType) return NextResponse.json({ success: false, message: 'Missing prompt type' }, { status: 400 });
        const prompt = await getAIPrompt(promptType);
        console.log(`Database API - Retrieved ${promptType} prompt:`, prompt);
        return NextResponse.json({ success: true, data: prompt });
      case 'getApiKey':
        console.log('Database API - Getting API key...');
        const service = searchParams.get('service');
        if (!service) return NextResponse.json({ success: false, message: 'Missing service name' }, { status: 400 });
        const apiKey = await getAPIKey(service);
        console.log(`Database API - Retrieved API key for ${service}`);
        return NextResponse.json({ success: true, data: apiKey });
      case 'deduplication-review':
        console.log('Database API - Getting deduplication review entries (paginated)...');
        const page = parseInt(searchParams.get('page') || '1', 10);
        const pageSize = parseInt(searchParams.get('pageSize') || '50', 10);
        console.log(`Database API - Page: ${page}, PageSize: ${pageSize}`);
        const { groups, totalGroups } = await getDeduplicationEntries(page, pageSize);
        console.log(`Database API - Retrieved ${Object.keys(groups).length} duplicate groups for page ${page}, total groups: ${totalGroups}`);
        return NextResponse.json({ success: true, data: { groups, totalGroups } });
      case 'all-details':
        console.log('Database API - Getting all entries with details...');
        const allDetailedEntries = await getAllEntriesWithDetails();
        console.log(`Database API - Retrieved ${allDetailedEntries.length} detailed entries`);
        return NextResponse.json({ success: true, data: allDetailedEntries });
      default:
        console.error('Database API - Invalid GET action:', action);
        return NextResponse.json({ success: false, message: 'Invalid GET action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Database API - Error processing GET request:', error);
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');
  console.log('Database API - POST request received - Action:', action);

  try {
    await ensureDbReady(); // Ensure DB and schema are ready

    const body = await request.json();

    switch (action) {
      case 'save':
        if (!body.entries || !Array.isArray(body.entries) || !body.source) return NextResponse.json({ success: false, message: 'Invalid request body' }, { status: 400 });
        await saveEntries(body.entries, body.source);
        return NextResponse.json({ success: true });
      case 'update-screening':
      case 'update-status':
        console.log('Database API - Processing update screening request:', { body, action });
        if (!body.id || !body.screeningType || !body.status) {
          console.error('Database API - Invalid update screening request:', body);
          return NextResponse.json({ success: false, message: 'Invalid request body' }, { status: 400 });
        }
        try {
          console.log('Database API - update-screening - body:', body);
          await updateScreeningStatus(body.id, body.screeningType, body.status, body.notes, body.confidence);
          console.log('Database API - Successfully updated screening status', body);
          return NextResponse.json({ success: true });
        } catch (error) {
          console.error('Database API - Error updating screening status (single):', error);
          return NextResponse.json({ success: false, message: error instanceof Error ? error.message : 'Unknown error updating screening status' }, { status: 500 });
        }

      case 'update-screening-batch': // New action for batch updates
        console.log('Database API - Processing batch update screening request...');
        if (!body.updates || !Array.isArray(body.updates)) {
          console.error('Database API - Invalid batch update screening request:', body);
          return NextResponse.json({ success: false, message: 'Invalid request body: "updates" array is required' }, { status: 400 });
        }
        try {
          const batchResult = await updateScreeningStatusBatch(body.updates);
          console.log('Database API - Successfully processed batch screening update', batchResult);
          // Return detailed results
          return NextResponse.json({ success: true, ...batchResult });
        } catch (error) {
          console.error('Database API - Error processing batch screening update:', error);
          return NextResponse.json({ success: false, message: error instanceof Error ? error.message : 'Unknown error processing batch screening update' }, { status: 500 });
        }

      case 'update-abstract':
        if (!body.id || !body.abstract) return NextResponse.json({ success: false, message: 'Invalid request body' }, { status: 400 });
        const db_abstract = await getDbConnection(); // Use different variable name to avoid conflict
        try {
            await db_abstract.run('UPDATE entries SET abstract = ? WHERE id = ?', [body.abstract, body.id]);
            return NextResponse.json({ success: true });
        } finally {
            await db_abstract.close(); // Close connection
        }
      case 'clear':
        await clearDatabase();
        return NextResponse.json({ success: true });
      case 'savePrompt':
        if (!body.screeningType || !body.prompt) return NextResponse.json({ success: false, message: 'Invalid request body' }, { status: 400 });
        await saveAIPrompt(body.screeningType, body.prompt);
        return NextResponse.json({ success: true });
      case 'saveApiKey':
        if (!body.service || !body.apiKey) return NextResponse.json({ success: false, message: 'Invalid request body' }, { status: 400 });
        await saveAPIKey(body.service, body.apiKey);
        return NextResponse.json({ success: true });
      case 'update-deduplication':
        console.log('Database API - Processing update deduplication request:', { body });
        if (!body.updates || !Array.isArray(body.updates)) return NextResponse.json({ success: false, message: 'Invalid request body: "updates" array is required' }, { status: 400 });
        try {
          await updateDeduplicationStatus(body.updates);
          console.log('Database API - Successfully updated deduplication status');
          return NextResponse.json({ success: true });
        } catch (error) {
          console.error('Database API - Error updating deduplication status:', error);
          return NextResponse.json({ success: false, message: error instanceof Error ? error.message : 'Unknown error updating deduplication status' }, { status: 500 });
        }
      case 'run-deduplication':
        console.log('Database API - Processing run deduplication request...');
        try {
          const result = await runDeduplicationProcess();
          console.log(`Database API - Deduplication process completed. Updated ${result.count} entries.`);
          return NextResponse.json({ success: true, count: result.count });
        } catch (error) {
          console.error('Database API - Error running deduplication process:', error);
          return NextResponse.json({ success: false, message: error instanceof Error ? error.message : 'Unknown error running deduplication process' }, { status: 500 });
        }
      case 'reset-title-screening':
        console.log('Database API - Processing reset title screening request...');
        try {
          await resetTitleScreeningStatus();
          console.log('Database API - Successfully reset title screening status for all entries.');
          return NextResponse.json({ success: true });
        } catch (error) {
          console.error('Database API - Error resetting title screening status:', error);
          return NextResponse.json({ success: false, message: error instanceof Error ? error.message : 'Unknown error resetting title screening status' }, { status: 500 });
        }
      case 'reset-abstract-screening':
        console.log('Database API - Processing reset abstract screening request...');
        try {
          await resetAbstractScreeningStatus();
          console.log('Database API - Successfully reset abstract screening status for relevant entries.');
          return NextResponse.json({ success: true });
        } catch (error) {
          console.error('Database API - Error resetting abstract screening status:', error);
          return NextResponse.json({ success: false, message: error instanceof Error ? error.message : 'Unknown error resetting abstract screening status' }, { status: 500 });
        }
      default:
        console.error('Database API - Invalid POST action:', action);
        return NextResponse.json({ success: false, message: 'Invalid POST action' }, { status: 400 });
    }
  } catch (error: any) {
    console.error('API error:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
