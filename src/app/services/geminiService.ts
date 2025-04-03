import { getAPIKey } from '../utils/database';

// Local storage key for tracking the next API key index
const GEMINI_KEY_INDEX_LS_KEY = 'geminiApiKeyIndex';

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
  error?: string; // Top-level error for the whole batch request
}

// Default configuration for Gemini API (currently unused in this service, but kept for potential future use)
// const DEFAULT_CONFIG = {
//   temperature: 0.7,
//   topP: 0.8,
//   topK: 40,
//   maxOutputTokens: 1024,
// };

// Helper function to manage API key rotation and fetch calls
async function callGeminiApiWithRotation(
  method: 'POST' | 'PUT',
  bodyPayload: Record<string, any>
): Promise<Response> {
  const apiKeys = await getAPIKey('gemini');
  if (!apiKeys || apiKeys.length === 0) {
    throw new Error('Gemini API keys not found or empty. Please set them in the settings.');
  }

  let currentIndex = 0;
  try {
    const storedIndex = localStorage.getItem(GEMINI_KEY_INDEX_LS_KEY);
    if (storedIndex) {
      currentIndex = parseInt(storedIndex, 10);
      if (isNaN(currentIndex) || currentIndex < 0 || currentIndex >= apiKeys.length) {
        currentIndex = 0; // Reset if invalid
      }
    }
  } catch (e) {
    console.error("Could not read API key index from localStorage", e);
    currentIndex = 0; // Default to 0 on error
  }

  const totalKeys = apiKeys.length;
  let lastError: Error | null = null;

  for (let i = 0; i < totalKeys; i++) {
    const keyIndexToTry = (currentIndex + i) % totalKeys;
    const apiKeyToUse = apiKeys[keyIndexToTry];
    const nextIndex = (keyIndexToTry + 1) % totalKeys; // Index to store for the *next* call

    try {
      console.log(`Attempting Gemini API call with key index: ${keyIndexToTry}`);
      const response = await fetch('/api/gemini', {
        method: method,
        headers: {
          'Content-Type': 'application/json',
        },
        // Add the selected API key to the payload for the backend
        body: JSON.stringify({ ...bodyPayload, apiKey: apiKeyToUse }),
      });

      // Check for quota errors specifically to allow retrying with the next key
      // Gemini might return 429 Too Many Requests, or specific error messages in the body.
      // The backend /api/gemini route should ideally propagate the status code or error message.
      if (!response.ok) {
        let errorData;
        try {
          errorData = await response.json();
        } catch (jsonError) {
          // If response is not JSON, use status text
          errorData = { error: response.statusText };
        }
        const errorMessage = (errorData?.error || `API request failed with status ${response.status}`).toLowerCase();
        
        // Check for common quota/rate limit indicators
        const isQuotaError = response.status === 429 || 
                             errorMessage.includes('quota') || 
                             errorMessage.includes('rate limit') ||
                             errorMessage.includes('too many requests');

        if (isQuotaError) {
          console.warn(`Quota error encountered with key index ${keyIndexToTry}. Trying next key.`);
          lastError = new Error(errorData?.error || `Quota limit likely reached (status ${response.status})`);
          // Don't update localStorage index yet, continue loop
          continue; 
        } else {
          // For non-quota errors, store the next index and throw immediately
          localStorage.setItem(GEMINI_KEY_INDEX_LS_KEY, nextIndex.toString());
          throw new Error(errorData?.error || `API request failed with status ${response.status}`);
        }
      }

      // If successful, store the next index and return the response
      localStorage.setItem(GEMINI_KEY_INDEX_LS_KEY, nextIndex.toString());
      console.log(`Gemini API call successful with key index: ${keyIndexToTry}. Next index: ${nextIndex}`);
      return response;

    } catch (error: any) {
       // Catch errors thrown within the try block (e.g., non-quota fetch errors)
       // or network errors before fetch completes.
       // If it's not the quota error we explicitly continued on, we should stop.
       if (!lastError || error.message !== lastError.message) {
         localStorage.setItem(GEMINI_KEY_INDEX_LS_KEY, nextIndex.toString()); // Store next index even on failure
         throw error; // Re-throw the caught error
       }
       // If it IS the quota error, we just let the loop continue
       console.warn(`Caught error during API call with key index ${keyIndexToTry}, likely quota related, continuing...`, error.message);
    }
  }

  // If the loop completes without success (meaning all keys resulted in quota errors)
  throw new Error(`All Gemini API keys (${totalKeys}) failed, likely due to quota limits. Last error: ${lastError?.message || 'Unknown quota error'}`);
}


/**
 * Process text with Gemini API using key rotation
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
    const response = await callGeminiApiWithRotation('POST', { prompt, text, screeningType });
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
    console.error('Error calling Gemini API (processWithGemini):', error);
    throw new Error(
      `Failed to process with Gemini: ${error.message || 'Unknown error'}. Please check your API keys and network connection.`
    );
  }
}

/**
 * Process multiple items with Gemini API in batch using key rotation
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
    const response = await callGeminiApiWithRotation('PUT', { prompt, items, screeningType });
    const data = await response.json() as BatchApiResponse;

    if (data.error) {
      // Handle top-level batch errors (e.g., invalid request structure)
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
    // If the entire batch call failed (e.g., all keys exhausted), return error for all items
    return items.map(item => ({
      id: item.id,
      result: '',
      error: error.message || 'Failed to process batch with Gemini'
    }));
  }
}
