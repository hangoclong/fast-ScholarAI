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
    const statusField = screeningType === 'title' ? 'title_screening_status' : 'abstract_screening_status';
    const notesField = screeningType === 'title' ? 'title_screening_notes' : 'abstract_screening_notes';
    
    await db.run(
      `UPDATE entries SET ${statusField} = ?, ${notesField} = ? WHERE id = ?`,
      [status, notes || '', id]
    );
  } catch (error) {
    console.error(`Error updating ${screeningType} screening status:`, error);
    throw new Error(`Failed to update ${screeningType} screening status`);
  } finally {
    await db.close();
  }
}

// Clear database
async function clearDatabase(): Promise<void> {
  const db = await getDbConnection();
  
  try {
    await db.run('DELETE FROM entries');
  } catch (error) {
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
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');
    
    // Initialize database if needed
    const dbExists = await fs.access(DB_PATH).then(() => true).catch(() => false);
    if (!dbExists) {
      await initDatabase();
    }
    
    switch (action) {
      case 'init':
        await initDatabase();
        return NextResponse.json({ success: true, message: 'Database initialized' });
        
      case 'stats':
        const stats = await getDatabaseStats();
        return NextResponse.json({ success: true, data: stats });
        
      case 'all':
        const entries = await getAllEntries();
        return NextResponse.json({ success: true, data: entries });
        
      case 'title-screening':
        const titleEntries = await getTitleScreeningEntries();
        return NextResponse.json({ success: true, data: titleEntries });
        
      case 'abstract-screening':
        const abstractEntries = await getAbstractScreeningEntries();
        return NextResponse.json({ success: true, data: abstractEntries });
        
      case 'included':
        const includedEntries = await getIncludedEntries();
        return NextResponse.json({ success: true, data: includedEntries });
        
      case 'included-literature':
        const db = await getDbConnection();
        
        // Get entries that are included in either title or abstract screening
        const includedLiterature = await db.all(`
          SELECT * FROM entries 
          WHERE title_screening_status = 'included' 
          OR abstract_screening_status = 'included'
        `);
        
        return NextResponse.json({ success: true, entries: includedLiterature.map(convertRowToBibEntry) });
        
      case 'clear':
        await clearDatabase();
        return NextResponse.json({ success: true, message: 'Database cleared' });
        
      case 'update-abstract':
        try {
          const { id, abstract } = await request.json();
          
          if (!id) {
            return NextResponse.json({ error: 'Missing entry ID' }, { status: 400 });
          }
          
          const db = await getDbConnection();
          
          // Update the abstract in the database
          await db.run(
            'UPDATE entries SET abstract = ? WHERE id = ?',
            [abstract, id]
          );
          
          return NextResponse.json({ success: true });
        } catch (error) {
          console.error('Error updating abstract:', error);
          return NextResponse.json({ error: 'Failed to update abstract' }, { status: 500 });
        }
        
      default:
        return NextResponse.json({ success: false, message: 'Invalid action' }, { status: 400 });
    }
  } catch (error: any) {
    console.error('Database API error:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');
    const body = await request.json();
    
    // Initialize database if needed
    const dbExists = await fs.access(DB_PATH).then(() => true).catch(() => false);
    if (!dbExists) {
      await initDatabase();
    }
    
    switch (action) {
      case 'save':
        if (!body.entries || !Array.isArray(body.entries) || !body.source) {
          return NextResponse.json({ success: false, message: 'Invalid request body' }, { status: 400 });
        }
        await saveEntries(body.entries, body.source);
        return NextResponse.json({ success: true, message: 'Entries saved' });
        
      case 'update-screening':
        if (!body.id || !body.screeningType || !body.status) {
          return NextResponse.json({ success: false, message: 'Invalid request body' }, { status: 400 });
        }
        await updateScreeningStatus(body.id, body.screeningType, body.status, body.notes);
        return NextResponse.json({ success: true, message: 'Screening status updated' });
        
      case 'update-abstract':
        if (!body.id) {
          return NextResponse.json({ error: 'Missing entry ID' }, { status: 400 });
        }
        
        const db = await getDbConnection();
        
        // Update the abstract in the database
        await db.run(
          'UPDATE entries SET abstract = ? WHERE id = ?',
          [body.abstract, body.id]
        );
        
        return NextResponse.json({ success: true });
        
      default:
        return NextResponse.json({ success: false, message: 'Invalid action' }, { status: 400 });
    }
  } catch (error: any) {
    console.error('Database API error:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
