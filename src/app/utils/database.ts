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
export async function initDatabase(): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE_URL}?action=init`);
    
    if (!response.ok) {
      throw new Error(`API request failed with status ${response.status}`);
    }
    
    const data = await response.json();
    return data.success === true;
  } catch (error) {
    console.error('Error initializing database:', error);
    return false;
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
    
    // Check if the data is returned as 'data' or 'entries'
    return data.data || data.entries || [];
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
    
    // Check if the data is returned as 'data' or 'entries'
    return data.data || data.entries || [];
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
    
    // Check if the data is returned as 'data' or 'entries'
    return data.data || data.entries || [];
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
    
    // Check if the data is returned as 'data' or 'entries'
    return data.data || data.entries || [];
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
    console.log(`Attempting to update ${screeningType} screening for entry ${id} to status: ${status}`);
    console.log('Request payload:', { id, screeningType, status, notes });
    
    const response = await fetch(`${API_BASE_URL}?action=update-screening`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ id, screeningType, status, notes }),
    });
    
    if (!response.ok) {
      console.error(`API request failed with status ${response.status}`);
      const errorText = await response.text();
      console.error('Error response:', errorText);
      throw new Error(`API request failed with status ${response.status}: ${errorText}`);
    }
    
    const data = await response.json();
    console.log('API response:', data);
    
    if (!data.success) {
      console.error('API returned error:', data);
      throw new Error(data.message || `Failed to update ${screeningType} screening status`);
    }
    
    console.log(`Successfully updated ${screeningType} screening for entry ${id}`);
  } catch (error) {
    console.error(`Error updating ${screeningType} screening status:`, error);
    console.error('Error details:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
    throw new Error(`Failed to update ${screeningType} screening status: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
    const response = await fetch(`${API_BASE_URL}?action=clear`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });
    
    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.message || `API request failed with status ${response.status}`);
    }
    
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
      throw new Error(data.message || 'Failed to get database statistics');
    }
    
    // Check if stats are in data.data or data.stats
    const stats = data.data || data.stats || {
      total: 0,
      titleScreening: { pending: 0, included: 0, excluded: 0, maybe: 0 },
      abstractScreening: { pending: 0, included: 0, excluded: 0, maybe: 0 }
    };
    
    return stats;
  } catch (error) {
    console.error('Error getting database statistics:', error);
    // Return default stats object on error
    return {
      total: 0,
      titleScreening: { pending: 0, included: 0, excluded: 0, maybe: 0 },
      abstractScreening: { pending: 0, included: 0, excluded: 0, maybe: 0 }
    };
  }
}

// Default prompts for screening
const DEFAULT_PROMPTS = {
  title: 'Based on the title "{text}", determine if this paper should be included in a literature review. Consider the relevance to the research topic.\n\nProvide your response in JSON format with the following structure:\n{\n  "decision": "INCLUDE", "EXCLUDE", or "MAYBE",\n  "confidence": a number between 0 and 1,\n  "reasoning": "Your reasoning for this decision"\n}\n\nEnsure your response is valid JSON that can be parsed directly.',
  abstract: 'Based on the abstract "{text}", determine if this paper should be included in a literature review. Consider methodology, findings, and relevance to the research topic.\n\nProvide your response in JSON format with the following structure:\n{\n  "decision": "INCLUDE", "EXCLUDE", or "MAYBE",\n  "confidence": a number between 0 and 1,\n  "reasoning": "Your detailed analysis and reasoning for this decision"\n}\n\nEnsure your response is valid JSON that can be parsed directly.'
};

// Save AI prompt for a specific screening type
export async function saveAIPrompt(screeningType: 'title' | 'abstract', prompt: string): Promise<void> {
  try {
    const response = await fetch(`${API_BASE_URL}?action=savePrompt`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        screeningType,
        prompt,
      }),
    });
    
    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.message || `Failed to save ${screeningType} prompt`);
    }
  } catch (error) {
    console.error(`Error saving ${screeningType} prompt:`, error);
    throw new Error(`Failed to save ${screeningType} prompt`);
  }
}

// Get AI prompt for a specific screening type
export async function getAIPrompt(screeningType: 'title' | 'abstract'): Promise<string> {
  try {
    const response = await fetch(`${API_BASE_URL}?action=getPrompt&type=${screeningType}`);
    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.message || `Failed to get ${screeningType} prompt`);
    }
    
    // Check if prompt is in data.data or data.prompt
    const prompt = data.data || data.prompt || '';
    return prompt;
  } catch (error) {
    console.error(`Error getting ${screeningType} prompt:`, error);
    // Return default prompts based on screening type
    return screeningType === 'title' ? DEFAULT_PROMPTS.title : DEFAULT_PROMPTS.abstract;
  }
}

// Get API key from database
export async function getAPIKey(service: 'gemini'): Promise<string> {
  try {
    const response = await fetch(`${API_BASE_URL}?action=getApiKey&service=${service}`);
    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.message || `Failed to get ${service} API key`);
    }
    
    // Check if API key is in data.data or data.apiKey
    const apiKey = data.data || data.apiKey || '';
    return apiKey;
  } catch (error) {
    console.error(`Error getting ${service} API key:`, error);
    return '';
  }
}

// Save API key to database
export async function saveAPIKey(service: 'gemini', apiKey: string): Promise<void> {
  try {
    const response = await fetch(`${API_BASE_URL}?action=saveApiKey`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        service,
        apiKey,
      }),
    });
    
    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.message || `Failed to save ${service} API key`);
    }
  } catch (error) {
    console.error(`Error saving ${service} API key:`, error);
    throw new Error(`Failed to save ${service} API key`);
  }
}
