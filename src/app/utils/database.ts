'use client';

import { BibEntry, ScreeningStatus } from '../types';

// API base URL
const API_BASE_URL = '/api/database';

// Check if database is initialized
export async function isDatabaseInitialized(): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE_URL}?action=stats`);
    const data = await response.json();
    return data.success;
  } catch (error) {
    console.error('Error checking database initialization:', error);
    return false;
  }
}

// Initialize database
export async function initDatabase(): Promise<void> {
  try {
    const response = await fetch(`${API_BASE_URL}?action=init`);
    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.message || 'Failed to initialize database');
    }
  } catch (error) {
    console.error('Error initializing database:', error);
    throw new Error('Failed to initialize database');
  }
}

// Save entries to database
export async function saveEntries(entries: BibEntry[], source: string): Promise<void> {
  try {
    const response = await fetch(`${API_BASE_URL}?action=save`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ entries, source }),
    });
    
    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.message || 'Failed to save entries');
    }
  } catch (error) {
    console.error('Error saving entries:', error);
    throw new Error('Failed to save entries');
  }
}

// Get all entries
export async function getAllEntries(): Promise<BibEntry[]> {
  try {
    const response = await fetch(`${API_BASE_URL}?action=all`);
    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.message || 'Failed to get all entries');
    }
    
    return data.data;
  } catch (error) {
    console.error('Error getting all entries:', error);
    throw new Error('Failed to get all entries');
  }
}

// Get entries for title screening
export async function getTitleScreeningEntries(): Promise<BibEntry[]> {
  try {
    const response = await fetch(`${API_BASE_URL}?action=title-screening`);
    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.message || 'Failed to get title screening entries');
    }
    
    return data.data;
  } catch (error) {
    console.error('Error getting title screening entries:', error);
    throw new Error('Failed to get title screening entries');
  }
}

// Get entries for abstract screening
export async function getAbstractScreeningEntries(): Promise<BibEntry[]> {
  try {
    const response = await fetch(`${API_BASE_URL}?action=abstract-screening`);
    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.message || 'Failed to get abstract screening entries');
    }
    
    return data.data;
  } catch (error) {
    console.error('Error getting abstract screening entries:', error);
    throw new Error('Failed to get abstract screening entries');
  }
}

// Get included entries
export async function getIncludedEntries(): Promise<BibEntry[]> {
  try {
    const response = await fetch(`${API_BASE_URL}?action=included`);
    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.message || 'Failed to get included entries');
    }
    
    return data.data;
  } catch (error) {
    console.error('Error getting included entries:', error);
    throw new Error('Failed to get included entries');
  }
}

// Get included literature (entries included in either title or abstract screening)
export async function getIncludedLiterature(): Promise<BibEntry[]> {
  try {
    const response = await fetch('/api/database?action=included-literature', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to get included literature: ${response.statusText}`);
    }

    const data = await response.json();
    return data.entries;
  } catch (error) {
    console.error('Error getting included literature:', error);
    throw error;
  }
}

// Update screening status
export async function updateScreeningStatus(
  id: string, 
  screeningType: 'title' | 'abstract', 
  status: ScreeningStatus,
  notes?: string
): Promise<void> {
  try {
    const response = await fetch(`${API_BASE_URL}?action=update-screening`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ id, screeningType, status, notes }),
    });
    
    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.message || `Failed to update ${screeningType} screening status`);
    }
  } catch (error) {
    console.error(`Error updating ${screeningType} screening status:`, error);
    throw new Error(`Failed to update ${screeningType} screening status`);
  }
}

// Update the abstract for a specific entry
export async function updateEntryAbstract(id: string, abstract: string): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE_URL}?action=update-abstract`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ id, abstract }),
    });
    
    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.message || 'Failed to update entry abstract');
    }
    
    return true;
  } catch (error) {
    console.error('Error updating entry abstract:', error);
    return false;
  }
}

// Clear database
export async function clearDatabase(): Promise<void> {
  try {
    const response = await fetch(`${API_BASE_URL}?action=clear`);
    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.message || 'Failed to clear database');
    }
  } catch (error) {
    console.error('Error clearing database:', error);
    throw new Error('Failed to clear database');
  }
}

// Get database statistics
export async function getDatabaseStats(): Promise<{
  total: number;
  titleScreening: { pending: number; included: number; excluded: number; maybe: number };
  abstractScreening: { pending: number; included: number; excluded: number; maybe: number };
}> {
  try {
    const response = await fetch(`${API_BASE_URL}?action=stats`);
    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.message || 'Failed to get database stats');
    }
    
    return data.data;
  } catch (error) {
    console.error('Error getting database stats:', error);
    throw new Error('Failed to get database stats');
  }
}
