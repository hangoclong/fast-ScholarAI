import axios from 'axios';
import { getAPIKey } from '../utils/database';

// Types for API responses
interface ApiResponse {
  raw: string;
  parsed?: {
    decision: string;
    confidence: number;
    reasoning: string;
  };
  error?: string;
}

interface BatchApiResponse {
  results: {
    id: string;
    raw: string;
    parsed?: {
      decision: string;
      confidence: number;
      reasoning: string;
    };
    error?: string;
  }[];
  error?: string;
}

// Default configuration for Gemini API
const DEFAULT_CONFIG = {
  temperature: 0.7,
  topP: 0.8,
  topK: 40,
  maxOutputTokens: 1024,
};

/**
 * Process text with Gemini API
 * @param prompt The prompt template to use
 * @param text The text to process
 * @param screeningType The type of screening (title or abstract)
 * @returns The processed text from Gemini
 */
export async function processWithGemini(
  prompt: string,
  text: string,
  screeningType?: 'title' | 'abstract'
): Promise<string> {
  try {
    // Get the API key from client-side storage
    const apiKey = await getAPIKey('gemini');
    
    if (!apiKey) {
      throw new Error('Gemini API key not found. Please set it in the settings.');
    }

    // Make the API request to our Next.js API route
    const response = await fetch('/api/gemini', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ prompt, text, screeningType, apiKey }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `API request failed with status ${response.status}`);
    }

    const data = await response.json() as ApiResponse;
    
    if (data.error) {
      throw new Error(data.error);
    }

    // Return the raw text response or the formatted decision
    if (data.parsed) {
      return `Decision: ${data.parsed.decision}\nConfidence: ${data.parsed.confidence}\nReasoning: ${data.parsed.reasoning}`;
    }
    return data.raw;
  } catch (error: any) {
    console.error('Error calling Gemini API:', error);
    throw new Error(
      `Failed to process with Gemini: ${error.message || 'Unknown error'}`
    );
  }
}

/**
 * Process multiple items with Gemini API in batch
 * @param prompt The prompt template to use
 * @param items Array of items to process with their IDs and text content
 * @param screeningType The type of screening (title or abstract)
 * @returns Array of results with item IDs and processed text
 */
export async function batchProcessWithGemini(
  prompt: string,
  items: { id: string; text: string }[],
  screeningType?: 'title' | 'abstract'
): Promise<{ id: string; result: string; error?: string }[]> {
  try {
    // Get the API key from client-side storage
    const apiKey = await getAPIKey('gemini');
    
    if (!apiKey) {
      throw new Error('Gemini API key not found. Please set it in the settings.');
    }

    // Make the API request to our Next.js API route
    const response = await fetch('/api/gemini', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ prompt, items, screeningType, apiKey }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `API request failed with status ${response.status}`);
    }

    const data = await response.json() as BatchApiResponse;
    
    if (data.error) {
      throw new Error(data.error);
    }

    // Format the results
    return data.results.map(item => {
      if (item.error) {
        return { id: item.id, result: '', error: item.error };
      }
      
      if (item.parsed) {
        return { 
          id: item.id, 
          result: `Decision: ${item.parsed.decision}\nConfidence: ${item.parsed.confidence}\nReasoning: ${item.parsed.reasoning}` 
        };
      }
      
      return { id: item.id, result: item.raw };
    });
  } catch (error: any) {
    console.error('Error in batch processing with Gemini:', error);
    // Return error for all items
    return items.map(item => ({
      id: item.id,
      result: '',
      error: error.message || 'Failed to process with Gemini'
    }));
  }
}
