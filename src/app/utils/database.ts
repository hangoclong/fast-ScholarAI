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
      body: JSON.stringify({ screeningType: screeningType, status: status, notes: notes, id: id }),
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

// Get entries for deduplication review, grouped by duplicate_group_id (paginated)
export async function getDeduplicationReviewEntries(
  page: number = 1, 
  pageSize: number = 50
): Promise<{ groups: Record<string, BibEntry[]>, totalGroups: number }> {
  try {
    const response = await fetch(`${API_BASE_URL}?action=deduplication-review&page=${page}&pageSize=${pageSize}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API request failed with status ${response.status}: ${errorText}`);
    }
    
    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.message || 'Failed to get deduplication review entries');
    }
    
    // Expects data in { success: true, data: { groups: { [groupId]: BibEntry[] }, totalGroups: number } } format
    return data.data || { groups: {}, totalGroups: 0 }; 
  } catch (error) {
    console.error('Error getting deduplication review entries:', error);
    throw new Error(`Failed to get deduplication review entries: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Update deduplication status for multiple entries
export async function updateDeduplicationStatus(
  updates: { id: string; status: ScreeningStatus; is_duplicate?: number; is_primary?: number }[]
): Promise<void> {
  try {
    const response = await fetch(`${API_BASE_URL}?action=update-deduplication`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ updates }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API request failed with status ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    if (!data.success) {
      throw new Error(data.message || 'Failed to update deduplication status');
    }
    console.log('Successfully updated deduplication status via API.');
  } catch (error) {
    console.error('Error updating deduplication status:', error);
    throw new Error(`Failed to update deduplication status: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
} // Removed extra brace here

// Trigger the backend deduplication process
export async function runDeduplicationCheck(): Promise<{ count: number }> {
  try {
    const response = await fetch(`${API_BASE_URL}?action=run-deduplication`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}), // No body needed for this action
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API request failed with status ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    if (!data.success) {
      throw new Error(data.message || 'Failed to run deduplication check');
    }
    console.log(`Deduplication check completed. Updated ${data.count} entries.`);
    return { count: data.count || 0 };
  } catch (error) {
    console.error('Error running deduplication check:', error);
    throw new Error(`Failed to run deduplication check: ${error instanceof Error ? error.message : 'Unknown error'}`);
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

// Reset title screening status for all entries
export async function resetTitleScreeningStatus(): Promise<void> {
  try {
    const response = await fetch(`${API_BASE_URL}?action=reset-title-screening`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}), // No body needed for this action
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API request failed with status ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    if (!data.success) {
      throw new Error(data.message || 'Failed to reset title screening status');
    }
    console.log('Successfully reset title screening status via API.');
  } catch (error) {
    console.error('Error resetting title screening status:', error);
    throw new Error(`Failed to reset title screening status: ${error instanceof Error ? error.message : 'Unknown error'}`);
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

// Get API keys from database (returns an array of strings)
export async function getAPIKey(service: 'gemini'): Promise<string[]> {
  try {
    const response = await fetch(`${API_BASE_URL}?action=getApiKey&service=${service}`);
    const data = await response.json();

    if (!data.success) {
      // It might just mean the key hasn't been set yet, which isn't necessarily an error here.
      console.log(`No API key found for ${service} or failed to retrieve.`);
      return []; 
    }

    // Check if API key is in data.data or data.apiKey
    const storedValue = data.data || data.apiKey || '';

    if (!storedValue) {
      return [];
    }

    // Attempt to parse the stored value as a JSON array
    try {
      const keysArray = JSON.parse(storedValue);
      if (Array.isArray(keysArray) && keysArray.every(key => typeof key === 'string')) {
        return keysArray.filter(key => key.trim().length > 0); // Filter out empty strings
      } else {
        // If it's not a valid array of strings, treat it as potentially a single legacy key
        // or invalid data. Return it as a single-element array if it's a non-empty string.
        if (typeof storedValue === 'string' && storedValue.trim().length > 0) {
           console.warn(`Stored API key for ${service} is not a JSON array. Treating as single key.`);
           return [storedValue.trim()];
        }
        return []; // Return empty if parsing fails or it's not an array
      }
    } catch (parseError) {
      // If JSON parsing fails, it might be a single legacy key.
       if (typeof storedValue === 'string' && storedValue.trim().length > 0) {
           console.warn(`Failed to parse stored API key for ${service} as JSON. Treating as single key. Error: ${parseError}`);
           return [storedValue.trim()];
       }
      console.error(`Error parsing stored API key for ${service}:`, parseError);
      return [];
    }
  } catch (error) {
    console.error(`Error getting ${service} API key:`, error);
    return []; // Return empty array on fetch error
  }
}

// Save API keys to database (accepts an array of strings)
export async function saveAPIKey(service: 'gemini', apiKeys: string[]): Promise<void> {
  try {
    // Ensure apiKeys is an array before stringifying
    const keysToSave = Array.isArray(apiKeys) ? apiKeys : [];
    const valueToStore = JSON.stringify(keysToSave);

    const response = await fetch(`${API_BASE_URL}?action=saveApiKey`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        service,
        apiKey: valueToStore, // Store the JSON stringified array
      }),
    });

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.message || `Failed to save ${service} API keys`);
    }
  } catch (error) {
    console.error(`Error saving ${service} API keys:`, error);
    throw new Error(`Failed to save ${service} API keys`);
  }
}
