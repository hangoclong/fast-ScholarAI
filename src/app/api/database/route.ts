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
  return open({
    filename: DB_PATH,
    driver: sqlite3.Database
  });
}

// Initialize database
async function initDatabase(): Promise<void> {
  const db = await getDbConnection();
  
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
        deduplication_status TEXT DEFAULT 'pending', -- Added
        is_duplicate INTEGER DEFAULT 0,             -- Added
        duplicate_group_id TEXT,                    -- Added
        is_primary_duplicate INTEGER DEFAULT 0,     -- Added
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
    
    console.log('Database tables created successfully');
    return;
  } catch (error) {
    console.error('Error initializing database:', error);
    throw new Error('Failed to initialize database');
  } finally {
    await db.close();
  }
}

// Helper function to generate a random alphanumeric suffix
function generateRandomSuffix(length: number = 6): string {
  const characters = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  const charactersLength = characters.length;
  // Use crypto for potentially better randomness if available, fallback to Math.random
  try {
    const buffer = randomBytes(length);
    for (let i = 0; i < length; i++) {
      result += characters.charAt(buffer[i] % charactersLength);
    }
  } catch (e) {
    // Fallback if crypto is not available (e.g., some environments)
    console.warn("crypto.randomBytes not available, falling back to Math.random for suffix generation.");
    for (let i = 0; i < length; i++) {
      result += characters.charAt(Math.floor(Math.random() * charactersLength));
    }
  }
  return result;
}

// Save entries to database
async function saveEntries(entries: BibEntry[], source: string): Promise<void> {
  const db = await getDbConnection();
  
  try {
    // Begin transaction
    await db.run('BEGIN TRANSACTION');
    
    // Prepare statement listing only columns we provide values for
    const insertStmt = await db.prepare(
      `INSERT INTO entries (
        id, entry_type, title, author, year, journal, booktitle, publisher,
        abstract, doi, url, keywords, pages, volume, issue, source, json_data
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)` // Let DB handle defaults for new columns
    );

    for (const entry of entries) {
      // Extract common fields
      const { 
        ENTRYTYPE, title, author, year, journal, booktitle, publisher, 
        abstract, doi, url, keywords, pages, volume, number
      } = entry;
      let currentId = entry.ID; // Use let as ID might change on retry
      
      // Store remaining fields as JSON
      const remainingFields: Record<string, any> = {};
      for (const key in entry) {
        if (![
          'ID', 'ENTRYTYPE', 'title', 'author', 'year', 'journal', 'booktitle', 'publisher',
          'abstract', 'doi', 'url', 'keywords', 'pages', 'volume', 'number',
          'title_screening_status', 'abstract_screening_status'
        ].includes(key)) {
          remainingFields[key] = entry[key as keyof BibEntry];
        }
      }
      const jsonData = JSON.stringify(remainingFields);

      try {
        // Attempt initial insertion (DB handles defaults for new columns)
        await insertStmt.run(
          currentId, ENTRYTYPE, title, author, year, journal, booktitle, publisher,
          abstract, doi, url, keywords, pages, volume, number, source, jsonData
        );
      } catch (error: any) {
        // Check if it's a primary key constraint violation
        if (error.code === 'SQLITE_CONSTRAINT_PRIMARYKEY' || (error.code === 'SQLITE_CONSTRAINT' && error.message.includes('UNIQUE constraint failed: entries.id'))) {
          console.warn(`Duplicate ID detected: ${currentId}. Attempting insertion with suffix.`);
          // Generate suffix and retry
          const suffix = generateRandomSuffix(4);
          const originalId = currentId; // Keep original for logging if needed
          currentId = `${originalId}_${suffix}`; // Append suffix
          
          try {
            // Retry insertion with the new ID (DB handles defaults for new columns)
            await insertStmt.run(
              currentId, ENTRYTYPE, title, author, year, journal, booktitle, publisher,
              abstract, doi, url, keywords, pages, volume, number, source, jsonData
            );
            console.log(`Successfully inserted entry with modified ID: ${currentId} (original: ${originalId})`);
          } catch (retryError: any) {
            // If retry also fails (e.g., extremely rare suffix collision or other issue)
            console.error(`Failed to insert entry with modified ID ${currentId} (original: ${originalId}):`, retryError);
            // Re-throw the retry error to trigger rollback
            throw retryError; 
          }
        } else {
          // If it's a different error, re-throw to trigger rollback
          console.error(`Non-duplicate error during insertion for ID ${currentId}:`, error);
          throw error;
        }
      }
    }
    
    // Finalize the prepared statement
    await insertStmt.finalize();

    // Commit transaction
    await db.run('COMMIT');
    console.log(`Successfully saved/updated ${entries.length} entries from source: ${source}`);

  } catch (error) {
    // Rollback transaction on any unhandled error
    console.error('Error saving entries, rolling back transaction:', error);
    try {
      await db.run('ROLLBACK');
    } catch (rollbackError) {
      console.error('Error rolling back transaction:', rollbackError);
    }
    throw new Error(`Failed to save entries: ${error instanceof Error ? error.message : 'Unknown error'}`);
  } finally {
    // Ensure DB connection is closed
    try {
      await db.close();
    } catch (closeError) {
      console.error('Error closing database connection:', closeError);
    }
  }
}

// Get all entries with ALL details (for export)
async function getAllEntriesWithDetails(): Promise<any[]> { // Return type as any[] since we fetch all columns
  const db = await getDbConnection();
  try {
    // Select all columns from the entries table
    const rows = await db.all('SELECT * FROM entries ORDER BY created_at DESC');
    // We don't need to convert to BibEntry here, just return the raw rows
    // Parsing JSON data might be useful depending on desired export format, but let's keep it simple first
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

// Get entries for title screening
async function getTitleScreeningEntries(): Promise<BibEntry[]> {
  const db = await getDbConnection();
  
  try {
    // Get entries for title screening:
    // - Fetch ALL entries NOT excluded during deduplication review.
    // - Frontend table will handle filtering by title_screening_status.
    const rows = await db.all(`
      SELECT * FROM entries 
      WHERE deduplication_status != 'excluded' 
      ORDER BY year DESC
    `);
    
    return rows.map(convertRowToBibEntry);
  } catch (error) {
    console.error('Error getting title screening entries:', error);
    throw new Error('Failed to get title screening entries');
  } finally {
    await db.close();
  }
}

// Get entries for abstract screening
async function getAbstractScreeningEntries(): Promise<BibEntry[]> {
  const db = await getDbConnection();
  
  try {
    // Get entries that passed title screening (status = 'included').
    // - Fetch ALL such entries, regardless of abstract_screening_status.
    // - Frontend table will handle filtering by abstract_screening_status.
    const rows = await db.all(`
      SELECT * FROM entries 
      WHERE title_screening_status = 'included'
      ORDER BY year DESC
    `);
    
    return rows.map(convertRowToBibEntry);
  } catch (error) {
    console.error('Error getting abstract screening entries:', error);
    throw new Error('Failed to get abstract screening entries');
  } finally {
    await db.close();
  }
}

// Get included entries
async function getIncludedEntries(): Promise<BibEntry[]> {
  const db = await getDbConnection();
  
  try {
    // Get entries that have been included in both title and abstract screening
    const rows = await db.all(`
      SELECT * FROM entries 
      WHERE title_screening_status = 'included'
      AND abstract_screening_status = 'included'
      ORDER BY year DESC
    `);
    
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
  const db = await getDbConnection();
  try {
    const rows = await db.all(`
      SELECT * FROM entries 
      WHERE (title_screening_status = 'included' OR abstract_screening_status = 'included')
      AND deduplication_status != 'excluded'
      ORDER BY year DESC
    `);
    return rows.map(convertRowToBibEntry);
  } catch (error) {
    console.error('Error getting included literature entries:', error);
    throw new Error('Failed to get included literature entries');
  } finally {
    await db.close();
  }
}

// Update screening status
async function updateScreeningStatus(
  id: string, 
  screeningType: 'title' | 'abstract', 
  status: ScreeningStatus,
  notes?: string
): Promise<void> {
  const db = await getDbConnection();
  
  try {
    console.log(`Server: Updating ${screeningType} screening for entry ${id} to status: ${status}`);
    console.log('Server: Request payload:', { id, screeningType, status, notes });
    
    const statusField = screeningType === 'title' ? 'title_screening_status' : 'abstract_screening_status';
    const notesField = screeningType === 'title' ? 'title_screening_notes' : 'abstract_screening_notes';
    
    // First check if the entry exists
    const entry = await db.get('SELECT id FROM entries WHERE id = ?', [id]);
    if (!entry) {
      console.error(`Server: Entry with ID ${id} not found`);
      throw new Error(`Entry with ID ${id} not found`);
    }
    
    const query = `UPDATE entries SET ${statusField} = ?, ${notesField} = ? WHERE id = ?`;
    console.log('Server: Executing query:', query);
    console.log('Server: With parameters:', [status, notes || '', id]);
    
    const result = await db.run(
      query,
      [status, notes || '', id]
    );
    
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
    // Begin transaction
    await db.run('BEGIN TRANSACTION');
    
    // Clear entries table only
    await db.run('DELETE FROM entries');
    console.log('Entries table cleared');
    
    // Don't delete settings as they contain API keys and prompts
    // If you want to clear everything, uncomment the line below
    // await db.run('DELETE FROM settings');
    
    // Commit transaction
    await db.run('COMMIT');
    console.log('Database cleared successfully');
  } catch (error) {
    // Rollback on error
    await db.run('ROLLBACK');
    console.error('Error clearing database:', error);
    throw new Error('Failed to clear database');
  } finally {
    await db.close();
  }
}

// Get database statistics
async function getDatabaseStats(): Promise<{
  total: number; // Total non-excluded entries
  titleScreening: { pending: number; included: number; excluded: number; maybe: number };
  abstractScreening: { pending: number; included: number; excluded: number; maybe: number };
  deduplication: { groupsPending: number; entriesPending: number; excluded: number; }; // Added deduplication stats
}> {
  const db = await getDbConnection();
  
  try {
    // Define the base condition to exclude finalized duplicates
    const baseCondition = "deduplication_status != 'excluded'";

    // Get total count (excluding finalized duplicates)
    const totalResult = await db.get(`SELECT COUNT(*) as count FROM entries WHERE ${baseCondition}`);
    const total = totalResult?.count || 0;
    
    // Get title screening counts (excluding finalized duplicates)
    const titlePendingResult = await db.get(`SELECT COUNT(*) as count FROM entries WHERE title_screening_status = 'pending' AND ${baseCondition}`);
    const titleIncludedResult = await db.get(`SELECT COUNT(*) as count FROM entries WHERE title_screening_status = 'included' AND ${baseCondition}`);
    const titleExcludedResult = await db.get(`SELECT COUNT(*) as count FROM entries WHERE title_screening_status = 'excluded' AND ${baseCondition}`);
    const titleMaybeResult = await db.get(`SELECT COUNT(*) as count FROM entries WHERE title_screening_status = 'maybe' AND ${baseCondition}`);
    
    // Get abstract screening counts (implicitly excludes duplicates via title_screening_status = 'included', 
    // but adding baseCondition for robustness)
    const abstractPendingResult = await db.get(`SELECT COUNT(*) as count FROM entries WHERE title_screening_status = 'included' AND abstract_screening_status = 'pending' AND ${baseCondition}`);
    const abstractIncludedResult = await db.get(`SELECT COUNT(*) as count FROM entries WHERE title_screening_status = 'included' AND abstract_screening_status = 'included' AND ${baseCondition}`);
    const abstractExcludedResult = await db.get(`SELECT COUNT(*) as count FROM entries WHERE title_screening_status = 'included' AND abstract_screening_status = 'excluded' AND ${baseCondition}`);
    const abstractMaybeResult = await db.get(`SELECT COUNT(*) as count FROM entries WHERE title_screening_status = 'included' AND abstract_screening_status = 'maybe' AND ${baseCondition}`);

    // Get deduplication counts
    // Groups pending: Count distinct non-null group IDs where status is pending
    const dedupGroupsPendingResult = await db.get(`SELECT COUNT(DISTINCT duplicate_group_id) as count FROM entries WHERE duplicate_group_id IS NOT NULL AND deduplication_status = 'pending'`);
    // Entries pending: Count entries where status is pending and group ID exists
    const dedupEntriesPendingResult = await db.get(`SELECT COUNT(*) as count FROM entries WHERE duplicate_group_id IS NOT NULL AND deduplication_status = 'pending'`);
    // Excluded via deduplication
    const dedupExcludedResult = await db.get(`SELECT COUNT(*) as count FROM entries WHERE deduplication_status = 'excluded'`);
    
    return {
      total, // Total entries NOT excluded by deduplication
      titleScreening: {
        pending: titlePendingResult?.count || 0,
        included: titleIncludedResult?.count || 0,
        excluded: titleExcludedResult?.count || 0,
        maybe: titleMaybeResult?.count || 0
      },
      abstractScreening: {
        pending: abstractPendingResult?.count || 0,
        included: abstractIncludedResult?.count || 0,
        excluded: abstractExcludedResult?.count || 0,
        maybe: abstractMaybeResult?.count || 0
      },
      deduplication: { // Added stats object
        groupsPending: dedupGroupsPendingResult?.count || 0,
        entriesPending: dedupEntriesPendingResult?.count || 0,
        excluded: dedupExcludedResult?.count || 0
      }
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
    // Save prompt to settings table
    await db.run(
      `INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)`,
      [`ai_prompt_${screeningType}`, prompt]
    );
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
    // Get prompt from settings table
    const result = await db.get(
      `SELECT value FROM settings WHERE key = ?`,
      [`ai_prompt_${screeningType}`]
    );
    
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
    // Save API key to settings table
    await db.run(
      `INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)`,
      [`api_key_${service}`, apiKey]
    );
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
    // Get API key from settings table
    const result = await db.get(
      `SELECT value FROM settings WHERE key = ?`,
      [`api_key_${service}`]
    );
    
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
    deduplication_status: row.deduplication_status as ScreeningStatus, // Added
    is_duplicate: row.is_duplicate,                                   // Added
    duplicate_group_id: row.duplicate_group_id,                       // Added
    is_primary_duplicate: row.is_primary_duplicate,                   // Added
    title_screening_notes: row.title_screening_notes,
    abstract_screening_notes: row.abstract_screening_notes,
    notes: row.notes,
    source: row.source,
    ...JSON.parse(row.json_data || '{}')
  };
}

// Get entries for deduplication review (grouped by duplicate_group_id)
async function getDeduplicationEntries(): Promise<Record<string, BibEntry[]>> {
  const db = await getDbConnection();
  try {
    // Fetch entries that are part of a duplicate group and potentially pending review
    // Order by group ID, then potentially by abstract length descending to prioritize richer entries
    const rows = await db.all(`
      SELECT * FROM entries 
      WHERE duplicate_group_id IS NOT NULL 
      AND deduplication_status = 'pending' 
      ORDER BY duplicate_group_id, LENGTH(abstract) DESC, id
    `);

    const groupedEntries: Record<string, BibEntry[]> = {};
    for (const row of rows) {
      const entry = convertRowToBibEntry(row);
      const groupId = entry.duplicate_group_id;
      if (groupId) {
        if (!groupedEntries[groupId]) {
          groupedEntries[groupId] = [];
        }
        groupedEntries[groupId].push(entry);
      }
    }
    return groupedEntries;
  } catch (error) {
    console.error('Error getting deduplication entries:', error);
    throw new Error('Failed to get deduplication entries');
  } finally {
    await db.close();
  }
}

// Run the deduplication process across all entries
async function runDeduplicationProcess(): Promise<{ count: number }> {
  console.log("Starting deduplication process...");
  const allEntries = await getAllEntries(); // Fetch all entries first
  console.log(`Fetched ${allEntries.length} entries for deduplication check.`);

  // Find potential duplicates (this modifies entries in place)
  const entriesWithDupInfo = findPotentialDuplicates(allEntries);
  
  const duplicatesToUpdate = entriesWithDupInfo.filter((e: BibEntry) => e.is_duplicate === 1 && e.duplicate_group_id); // Added type annotation
  console.log(`Found ${duplicatesToUpdate.length} entries marked as potential duplicates.`);

  if (duplicatesToUpdate.length === 0) {
    console.log("No potential duplicates found requiring database update.");
    return { count: 0 };
  }

  const db = await getDbConnection();
  try {
    await db.run('BEGIN TRANSACTION');
    // Reset existing duplicate flags before applying new ones? Consider implications.
    // For now, we only update entries identified in the current run.
    // We set status to 'pending' so they appear in the review queue.
    const stmt = await db.prepare(`
      UPDATE entries 
      SET 
        duplicate_group_id = ?, 
        is_duplicate = ?, 
        is_primary_duplicate = ?,
        deduplication_status = 'pending' 
      WHERE id = ?
    `);

    let updatedCount = 0;
    for (const entry of duplicatesToUpdate) {
      const result = await stmt.run(
        entry.duplicate_group_id,
        entry.is_duplicate,
        entry.is_primary_duplicate,
        entry.ID
      );
      if (result.changes && result.changes > 0) {
        updatedCount++;
      }
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
  const db = await getDbConnection();
  try {
    await db.run('BEGIN TRANSACTION');
    const stmt = await db.prepare(`
      UPDATE entries 
      SET 
        deduplication_status = ?, 
        is_duplicate = COALESCE(?, is_duplicate), 
        is_primary_duplicate = COALESCE(?, is_primary_duplicate)
      WHERE id = ?
    `);

    for (const update of updates) {
      await stmt.run(
        update.status,
        update.is_duplicate, // Will use existing value if undefined
        update.is_primary,   // Will use existing value if undefined
        update.id
      );
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


// API route handler
export async function GET(request: NextRequest) {
  console.log('Database API - GET request received');
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');
  
  console.log('Database API - Action:', action);
  
  try {
    // Check if database file exists
    try {
      await fs.access(DB_PATH);
      console.log('Database API - Database file exists at:', DB_PATH);
    } catch (error) {
      console.log('Database API - Database file does not exist, will be created');
    }
    
    switch (action) {
      case 'init':
        console.log('Database API - Initializing database...');
        await initDatabase();
        console.log('Database API - Database initialized successfully');
        return NextResponse.json({ success: true });
      
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
        console.log('Database API - Getting title screening entries...');
        const titleScreeningEntries = await getTitleScreeningEntries();
        console.log(`Database API - Retrieved ${titleScreeningEntries.length} title screening entries`);
        return NextResponse.json({ success: true, data: titleScreeningEntries });
      
      case 'abstract-screening':
        console.log('Database API - Getting abstract screening entries...');
        const abstractScreeningEntries = await getAbstractScreeningEntries();
        console.log(`Database API - Retrieved ${abstractScreeningEntries.length} abstract screening entries`);
        return NextResponse.json({ success: true, data: abstractScreeningEntries });
      
      case 'included':
        console.log('Database API - Getting included entries...');
        const includedEntries = await getIncludedEntries(); // This gets entries included in BOTH
        console.log(`Database API - Retrieved ${includedEntries.length} included entries (both stages)`);
        return NextResponse.json({ success: true, data: includedEntries });

      case 'included-literature': // New case for entries included in EITHER stage
        console.log('Database API - Getting included literature entries (either stage)...');
        const includedLiteratureEntries = await getIncludedLiteratureEntries();
        console.log(`Database API - Retrieved ${includedLiteratureEntries.length} included literature entries`);
        return NextResponse.json({ success: true, entries: includedLiteratureEntries }); // Return as 'entries' to match frontend expectation

      case 'getPrompt':
        console.log('Database API - Getting AI prompt...');
        const promptType = searchParams.get('type') as 'title' | 'abstract';
        if (!promptType) {
          return NextResponse.json({ success: false, message: 'Missing prompt type' }, { status: 400 });
        }
        const prompt = await getAIPrompt(promptType);
        console.log(`Database API - Retrieved ${promptType} prompt:`, prompt);
        return NextResponse.json({ success: true, data: prompt });
        
      case 'getApiKey':
        console.log('Database API - Getting API key...');
        const service = searchParams.get('service');
        if (!service) {
          return NextResponse.json({ success: false, message: 'Missing service name' }, { status: 400 });
        }
        const apiKey = await getAPIKey(service);
        console.log(`Database API - Retrieved API key for ${service}`);
        return NextResponse.json({ success: true, data: apiKey });

      case 'deduplication-review': // New action
        console.log('Database API - Getting deduplication review entries...');
        const deduplicationEntries = await getDeduplicationEntries();
        console.log(`Database API - Retrieved ${Object.keys(deduplicationEntries).length} duplicate groups`);
        return NextResponse.json({ success: true, data: deduplicationEntries });

      case 'all-details': // New action for comprehensive export data
        console.log('Database API - Getting all entries with details...');
        const allDetailedEntries = await getAllEntriesWithDetails();
        console.log(`Database API - Retrieved ${allDetailedEntries.length} detailed entries`);
        return NextResponse.json({ success: true, data: allDetailedEntries });
      
      default:
        console.error('Database API - Invalid GET action:', action);
        return NextResponse.json({ success: false, message: 'Invalid GET action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Database API - Error processing request:', error);
    if (error instanceof Error) {
      console.error('Database API - Error message:', error.message);
      console.error('Database API - Error stack:', error.stack);
    }
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}

// POST handler
export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');
  
  try {
    // Check if database exists
    try {
      await fs.access(DB_PATH);
    } catch (error) {
      // Create database if it doesn't exist
      await initDatabase();
    }
    
    // Parse request body
    const body = await request.json();
    
    switch (action) {
      case 'save':
        if (!body.entries || !Array.isArray(body.entries) || !body.source) {
          return NextResponse.json({ success: false, message: 'Invalid request body' }, { status: 400 });
        }
        
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
          await updateScreeningStatus(body.id, body.screeningType, body.status, body.notes);
          console.log('Database API - Successfully updated screening status', body);
          return NextResponse.json({ success: true });
        } catch (error) {
          console.error('Database API - Error updating screening status:', error);
          return NextResponse.json({
            success: false,
            message: error instanceof Error ? error.message : 'Unknown error updating screening status'
          }, { status: 500 });
        }
      
      case 'update-abstract':
        if (!body.id || !body.abstract) {
          return NextResponse.json({ success: false, message: 'Invalid request body' }, { status: 400 });
        }
        
        const db = await getDbConnection();
        
        // Update the abstract in the database
        await db.run(
          'UPDATE entries SET abstract = ? WHERE id = ?',
          [body.abstract, body.id]
        );
        
        return NextResponse.json({ success: true });
        
      case 'clear':
        await clearDatabase();
        return NextResponse.json({ success: true });
        
      case 'savePrompt':
        if (!body.screeningType || !body.prompt) {
          return NextResponse.json({ success: false, message: 'Invalid request body' }, { status: 400 });
        }
        
        await saveAIPrompt(body.screeningType, body.prompt);
        return NextResponse.json({ success: true });
        
      case 'saveApiKey':
        if (!body.service || !body.apiKey) {
          return NextResponse.json({ success: false, message: 'Invalid request body' }, { status: 400 });
        }
        
        await saveAPIKey(body.service, body.apiKey);
        return NextResponse.json({ success: true });

      case 'update-deduplication': // New action
        console.log('Database API - Processing update deduplication request:', { body });
        if (!body.updates || !Array.isArray(body.updates)) {
           console.error('Database API - Invalid update deduplication request:', body);
           return NextResponse.json({ success: false, message: 'Invalid request body: "updates" array is required' }, { status: 400 });
        }
        try {
          await updateDeduplicationStatus(body.updates);
          console.log('Database API - Successfully updated deduplication status');
          return NextResponse.json({ success: true });
        } catch (error) {
           console.error('Database API - Error updating deduplication status:', error);
           return NextResponse.json({
             success: false,
             message: error instanceof Error ? error.message : 'Unknown error updating deduplication status'
           }, { status: 500 });
        }
        
      case 'run-deduplication': // New action
        console.log('Database API - Processing run deduplication request...');
        try {
          const result = await runDeduplicationProcess();
          console.log(`Database API - Deduplication process completed. Updated ${result.count} entries.`);
          return NextResponse.json({ success: true, count: result.count });
        } catch (error) {
           console.error('Database API - Error running deduplication process:', error);
           return NextResponse.json({
             success: false,
             message: error instanceof Error ? error.message : 'Unknown error running deduplication process'
           }, { status: 500 });
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
