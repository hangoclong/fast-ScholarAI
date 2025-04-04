import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from "@google/generative-ai";

// Define the expected structure for the batch JSON response from Gemini
interface GeminiBatchResponseItem {
  id: string;
  decision: "INCLUDE" | "EXCLUDE" | "MAYBE"; // Added MAYBE for flexibility
  confidence: number;
  reasoning: string;
}

const DEFAULT_MODEL_NAME = "gemini-2.0-flash"; // Default model if none provided

export async function POST(request: NextRequest) {
  try {
    const reqBody = await request.json();
    // Expecting 'fullPrompt' which contains base instructions + formatted entry list
    // 'text' might still be sent by older frontend code, but 'fullPrompt' takes precedence
    // Also extract optional 'modelName'
    const { prompt: basePrompt, text: entryListText, fullPrompt: combinedPrompt, apiKey, modelName } = reqBody;

    // Use combinedPrompt if provided, otherwise construct it (for backward compatibility or simpler calls)
    const finalPrompt = combinedPrompt || (basePrompt && entryListText ? `${basePrompt}\n\nList of entries:\n\n${entryListText}` : null);

    // Determine the model to use
    const effectiveModelName = modelName || DEFAULT_MODEL_NAME;
    console.log(`Using Gemini model: ${effectiveModelName}`);

    if (!finalPrompt) {
      return NextResponse.json({ error: 'A complete prompt (fullPrompt or basePrompt + text) is required' }, { status: 400 });
    }

    if (!apiKey) {
      return NextResponse.json({ error: 'Gemini API key is required' }, { status: 400 });
    }

    console.log("Gemini API Request - Final Prompt Snippet:", finalPrompt.substring(0, 500) + "..."); // Log start of prompt

    const genAI = new GoogleGenerativeAI(apiKey);
    // Ensure JSON mode is enabled if the model supports it (check Gemini docs for specific model)
    // Forcing JSON output via prompt instructions is generally more reliable across models.
    const model = genAI.getGenerativeModel({ model: effectiveModelName /*, generationConfig: { responseMimeType: "application/json" } */ });

    // Adjust generation config - lower temperature might help with stricter JSON adherence
    const generationConfig = {
      temperature: 0, // Essential for consistency and accuracy. But resillience to slight variations is good for json output.
      //topK: 20, // Top-K sampling, set to 20 for more focused output
      //topP: 0.95, // Top-P sampling, set to 0.95 for a balance between creativity and coherence
      maxOutputTokens: 8192, // Increased max tokens to prevent truncation
      responseMimeType: "application/json", // Enable if model explicitly supports it
    };

    // Safety settings - adjust as needed
    const safetySettings = [
      { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
      { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
      { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
      { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
    ];

    console.log("Sending request to Gemini model...");
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: finalPrompt }] }],
      generationConfig,
      safetySettings,
    });
    console.log("Received response from Gemini model.");

    if (result.response) {
      const responseText = result.response.text();
      console.log("Gemini Raw Response Snippet:", responseText.substring(0, 500) + "...");

      // Attempt to parse the responseText as a JSON array
      try {
        let jsonStr = responseText;
        // Clean potential markdown fences
        const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/);
        if (jsonMatch && jsonMatch[1]) {
          jsonStr = jsonMatch[1].trim();
          console.log("Extracted JSON from markdown fences.");
        } else {
           // Sometimes the model might just return the JSON without fences
           jsonStr = responseText.trim();
           // Basic check if it looks like an array
           if (!jsonStr.startsWith('[') || !jsonStr.endsWith(']')) {
               console.warn("Response does not appear to be a JSON array, attempting parse anyway.");
           }
        }

        const parsedArray: GeminiBatchResponseItem[] = JSON.parse(jsonStr);

        // Basic validation of the parsed structure
        if (!Array.isArray(parsedArray)) {
          throw new Error("Parsed response is not an array.");
        }
        // Optional: Add more validation for items within the array if needed

        console.log(`Successfully parsed response into an array of ${parsedArray.length} items.`);
        // Return the parsed array directly
        return NextResponse.json({
          success: true,
          results: parsedArray // Send the array back under 'results' key
        });

      } catch (parseError: any) {
        console.error("Failed to parse Gemini response as JSON array:", parseError);
        console.error("Problematic Raw Response:", responseText); // Log the full raw response on error
        // Return an error response indicating parsing failure
        return NextResponse.json({
          success: false,
          error: `Failed to parse Gemini response as JSON array. Error: ${parseError.message}`,
          rawResponse: responseText // Include raw response for debugging on frontend if needed
        }, { status: 500 }); // Use 500 as it's a server-side parsing issue
      }
    } else {
      // Handle cases where the response might be blocked or empty - Simplified error
      console.error(`Gemini response blocked or empty. Full result object:`, JSON.stringify(result));
      // Provide a generic error message as accessing specific block reasons is proving unreliable with current types
      return NextResponse.json({
        success: false,
        error: 'Failed to get valid response from Gemini (response might be blocked or empty).',
        details: { blockReason: 'Blocked or Empty' } // Generic detail
      }, { status: 500 });
    }

  } catch (error: any) {
    console.error("Error in Gemini API POST route:", error);
    return NextResponse.json({ 
      error: error.message || 'An internal server error occurred' 
    }, { status: 500 });
  }
}
