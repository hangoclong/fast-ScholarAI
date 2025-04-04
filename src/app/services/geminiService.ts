import { getAPIKey } from '../utils/database';

// Local storage key for tracking the next API key index
const GEMINI_KEY_INDEX_LS_KEY = 'geminiApiKeyIndex';

// Define the structure for the expected JSON array items from the backend
// This should match the GeminiBatchResponseItem interface in the backend API route
export interface BatchResultItem {
  id: string;
  decision: "INCLUDE" | "EXCLUDE" | "MAYBE";
  confidence: number;
  reasoning: string;
  // Optional error field, in case the backend adds item-level errors in the future
  // or if we want to represent frontend processing errors per item.
  error?: string;
}

// Define the callback type
type AttemptCallback = (keyIndex: number, totalKeys: number) => void;

// Helper function to manage API key rotation and fetch calls
async function callGeminiApiWithRotation(
  method: 'POST' | 'PUT', // Keep PUT for potential future use or backward compatibility
  bodyPayload: Record<string, any>,
  onAttempt?: AttemptCallback // Add optional callback parameter
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

    // Invoke the callback before making the attempt
    if (onAttempt) {
      try {
        onAttempt(keyIndexToTry + 1, totalKeys); // Use 1-based index for display
      } catch (callbackError) {
        console.error("Error in onAttempt callback:", callbackError);
      }
    }

    try {
      console.log(`Attempting Gemini API call with key index: ${keyIndexToTry} (0-based) using ${method}`);
      const response = await fetch('/api/gemini', {
        method: method,
        headers: {
          'Content-Type': 'application/json',
        },
        // Add the selected API key to the payload for the backend
        body: JSON.stringify({ ...bodyPayload, apiKey: apiKeyToUse }),
      });

      // Check for quota errors specifically to allow retrying with the next key
      if (!response.ok) {
        let errorData;
        try {
          errorData = await response.json();
        } catch (jsonError) {
          errorData = { error: response.statusText };
        }
        const errorMessage = (errorData?.error || `API request failed with status ${response.status}`).toLowerCase();
        const isQuotaError = response.status === 429 ||
                             errorMessage.includes('quota') ||
                             errorMessage.includes('rate limit') ||
                             errorMessage.includes('too many requests');

        if (isQuotaError) {
          console.warn(`Quota error encountered with key index ${keyIndexToTry}. Trying next key.`);
          lastError = new Error(errorData?.error || `Quota limit likely reached (status ${response.status})`);
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
       if (!lastError || error.message !== lastError.message) {
         localStorage.setItem(GEMINI_KEY_INDEX_LS_KEY, nextIndex.toString());
         throw error;
       }
       console.warn(`Caught error during API call with key index ${keyIndexToTry}, likely quota related, continuing...`, error.message);
    }
  }

  throw new Error(`All Gemini API keys (${totalKeys}) failed, likely due to quota limits. Last error: ${lastError?.message || 'Unknown quota error'}`);
}


/**
 * Process a combined batch prompt with Gemini API using key rotation.
 * Sends the entire prompt (instructions + formatted entry list) in one go via POST.
 * @param fullPrompt The complete prompt string including instructions and the formatted list of entries.
 * @param onAttempt Optional callback function invoked before each key attempt: (keyIndex: number, totalKeys: number) => void
 * @param modelName Optional name of the Gemini model to use.
 * @returns A promise that resolves to an array of BatchResultItem objects parsed from the Gemini response.
 */
export async function processBatchPromptWithGemini(
  fullPrompt: string,
  onAttempt?: AttemptCallback, // Pass callback down
  modelName?: string // Add modelName parameter
): Promise<BatchResultItem[]> {
  try {
    // Pass the callback, full prompt, and model name to the helper function using POST
    // The backend POST handler now expects 'fullPrompt' and optionally 'modelName'
    const response = await callGeminiApiWithRotation('POST', { fullPrompt, modelName }, onAttempt);

    // Check if the response status is OK, otherwise throw based on status/body
    if (!response.ok) {
        let errorData;
        try {
            errorData = await response.json();
        } catch (jsonError) {
            errorData = { error: response.statusText };
        }
        // Include raw response in error if available and parsing failed
        const detail = errorData?.rawResponse ? ` Raw Response: ${errorData.rawResponse}` : '';
        throw new Error(`${errorData?.error || `API request failed with status ${response.status}`}.${detail}`);
    }

    // Parse the JSON response from the backend
    const data = await response.json();

    // Check the structure returned by our backend API route
    if (data.success === true && Array.isArray(data.results)) {
      // Validate the structure of each item in the results array (optional but recommended)
      const validatedResults = data.results.map((item: any) => {
        // Basic check for core fields
        if (typeof item.id !== 'string' || typeof item.decision !== 'string' || typeof item.confidence !== 'number' || typeof item.reasoning !== 'string') {
           console.warn("Received invalid item structure from backend:", item);
           // Return item with an error flag/message
           return {
                id: item.id || 'unknown_id', // Try to preserve ID if possible
                decision: 'MAYBE', // Default decision on error
                confidence: 0,
                reasoning: 'Error: Invalid item structure received from AI.',
                error: 'Invalid item structure received'
            };
        }
        // Cast to BatchResultItem if structure seems valid
        return item as BatchResultItem;
      });
      return validatedResults;
    } else if (data.success === false) {
      // Handle errors reported by the backend API route itself (e.g., parsing errors)
      console.error('Backend API reported an error:', data.error);
      // Include raw response in error if backend provided it
      const detail = data.rawResponse ? ` Raw Response: ${data.rawResponse}` : '';
      throw new Error(`${data.error || 'Backend API failed to process the request.'}${detail}`);
    } else {
      // Handle unexpected response structure from the backend
      console.error('Unexpected response structure from backend API:', data);
      throw new Error('Received unexpected response structure from the backend API.');
    }

  } catch (error: any) {
    console.error('Error calling Gemini API via processBatchPromptWithGemini:', error);
    // Re-throw a user-friendly error
    throw new Error(
      `Failed to process batch prompt with Gemini: ${error.message || 'Unknown error'}. Please check API keys, network connection, and backend logs.`
    );
  }
}

// NOTE: The old processWithGemini and batchProcessWithGemini functions have been removed
// as they are replaced by the single-prompt approach using processBatchPromptWithGemini.
