import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import { BibEntry, ScreeningStatus } from '@/app/types';

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

// Save entries to database
async function saveEntries(entries: BibEntry[], source: string): Promise<void> {
  const db = await getDbConnection();
  
  try {
    // Begin transaction
    await db.run('BEGIN TRANSACTION');
    
    for (const entry of entries) {
      // Check if entry already exists
      const existingEntry = await db.get('SELECT id FROM entries WHERE id = ?', entry.ID);
      
      if (existingEntry) {
        // Skip existing entry
        continue;
      }
      
      // Extract common fields
      const { 
        ID, ENTRYTYPE, title, author, year, journal, booktitle, publisher, 
        abstract, doi, url, keywords, pages, volume, number
      } = entry;
      
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
      
      // Insert entry
      await db.run(
        `INSERT INTO entries (
          id, entry_type, title, author, year, journal, booktitle, publisher,
          abstract, doi, url, keywords, pages, volume, issue, source, json_data
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          ID, ENTRYTYPE, title, author, year, journal, booktitle, publisher,
          abstract, doi, url, keywords, pages, volume, number, source, JSON.stringify(remainingFields)
        ]
      );
    }
    
    // Commit transaction
    await db.run('COMMIT');
  } catch (error) {
    // Rollback transaction on error
    await db.run('ROLLBACK');
    console.error('Error saving entries:', error);
    throw new Error('Failed to save entries');
  } finally {
    await db.close();
  }
}

// Get all entries
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
    // Get entries that are pending or in progress for title screening
    const rows = await db.all(`
      SELECT * FROM entries 
      WHERE title_screening_status IN ('pending', 'in_progress', 'maybe')
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
    // Get entries that passed title screening and are pending or in progress for abstract screening
    const rows = await db.all(`
      SELECT * FROM entries 
      WHERE title_screening_status = 'included'
      AND abstract_screening_status IN ('pending', 'in_progress', 'maybe')
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
  total: number;
  titleScreening: { pending: number; included: number; excluded: number; maybe: number };
  abstractScreening: { pending: number; included: number; excluded: number; maybe: number };
}> {
  const db = await getDbConnection();
  
  try {
    // Get total count
    const totalResult = await db.get('SELECT COUNT(*) as count FROM entries');
    const total = totalResult.count;
    
    // Get title screening counts
    const titlePendingResult = await db.get("SELECT COUNT(*) as count FROM entries WHERE title_screening_status = 'pending'");
    const titleIncludedResult = await db.get("SELECT COUNT(*) as count FROM entries WHERE title_screening_status = 'included'");
    const titleExcludedResult = await db.get("SELECT COUNT(*) as count FROM entries WHERE title_screening_status = 'excluded'");
    const titleMaybeResult = await db.get("SELECT COUNT(*) as count FROM entries WHERE title_screening_status = 'maybe'");
    
    // Get abstract screening counts
    const abstractPendingResult = await db.get("SELECT COUNT(*) as count FROM entries WHERE title_screening_status = 'included' AND abstract_screening_status = 'pending'");
    const abstractIncludedResult = await db.get("SELECT COUNT(*) as count FROM entries WHERE title_screening_status = 'included' AND abstract_screening_status = 'included'");
    const abstractExcludedResult = await db.get("SELECT COUNT(*) as count FROM entries WHERE title_screening_status = 'included' AND abstract_screening_status = 'excluded'");
    const abstractMaybeResult = await db.get("SELECT COUNT(*) as count FROM entries WHERE title_screening_status = 'included' AND abstract_screening_status = 'maybe'");
    
    return {
      total,
      titleScreening: {
        pending: titlePendingResult.count,
        included: titleIncludedResult.count,
        excluded: titleExcludedResult.count,
        maybe: titleMaybeResult.count
      },
      abstractScreening: {
        pending: abstractPendingResult.count,
        included: abstractIncludedResult.count,
        excluded: abstractExcludedResult.count,
        maybe: abstractMaybeResult.count
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
    title_screening_notes: row.title_screening_notes,
    abstract_screening_notes: row.abstract_screening_notes,
    notes: row.notes,
    source: row.source,
    ...JSON.parse(row.json_data || '{}')
  };
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
        const includedEntries = await getIncludedEntries();
        console.log(`Database API - Retrieved ${includedEntries.length} included entries`);
        return NextResponse.json({ success: true, data: includedEntries });
        
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
      
      default:
        console.error('Database API - Invalid action:', action);
        return NextResponse.json({ success: false, message: 'Invalid action' }, { status: 400 });
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
          await updateScreeningStatus(body.id, body.screeningType, body.status, body.notes);
          console.log('Database API - Successfully updated screening status');
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
      
      default:
        return NextResponse.json({ success: false, message: 'Invalid action' }, { status: 400 });
    }
  } catch (error: any) {
    console.error('API error:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
