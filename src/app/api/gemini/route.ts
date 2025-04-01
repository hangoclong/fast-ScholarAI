import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from "@google/generative-ai";

const MODEL_NAME = "gemini-2.0-flash"; // Using the flash model as requested

export async function POST(request: NextRequest) {
  try {
    const reqBody = await request.json();
    const { prompt, text, screeningType, apiKey } = reqBody;

    if (!prompt || !text) {
      return NextResponse.json({ error: 'Prompt and text are required' }, { status: 400 });
    }

    if (!apiKey) {
      return NextResponse.json({ error: 'Gemini API key is required' }, { status: 400 });
    }

    // Modify the prompt to request JSON response
    let jsonPrompt = prompt.replace('{text}', text);
    
    // Add instructions for JSON output based on screening type
    if (screeningType === 'title' || screeningType === 'abstract') {
      jsonPrompt += "\n\nProvide your response in JSON format with the following structure:\n" +
                  "{\n" +
                  "  \"decision\": \"INCLUDE\", \"EXCLUDE\", or \"MAYBE\",\n" +
                  "  \"confidence\": a number between 0 and 1,\n" +
                  "  \"reasoning\": \"Your reasoning for this decision\"\n" +
                  "}\n\n" +
                  "Ensure your response is valid JSON that can be parsed directly.";
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: MODEL_NAME });

    const generationConfig = {
      temperature: 0.7,
      topK: 40,
      topP: 0.8,
      maxOutputTokens: 1024,
    };

    // Safety settings - adjust as needed
    const safetySettings = [
      { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
      { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
      { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
      { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    ];

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: jsonPrompt }] }],
      generationConfig,
      safetySettings,
    });

    if (result.response) {
      const responseText = result.response.text();
      
      // Try to parse the response as JSON
      try {
        // Extract JSON from the response if it's wrapped in markdown code blocks
        let jsonStr = responseText;
        const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/);
        if (jsonMatch) {
          jsonStr = responseText.split('```json')[1].split('```')[0].trim();
        }
        
        const parsedResponse = JSON.parse(jsonStr);
        return NextResponse.json({ 
          raw: responseText,
          parsed: parsedResponse,
          decision: parsedResponse.decision,
          confidence: parsedResponse.confidence,
          reasoning: parsedResponse.reasoning
        });
      } catch (parseError) {
        console.warn("Failed to parse Gemini response as JSON:", parseError);
        // Return the raw text if parsing fails
        return NextResponse.json({ 
          raw: responseText,
          parsed: null,
          error: "Failed to parse response as JSON"
        });
      }
    } else {
      // Handle cases where the response might be blocked or empty
      return NextResponse.json({ 
        error: 'Failed to get response from Gemini.', 
        details: { blockReason: 'Response was empty or blocked' } 
      }, { status: 500 });
    }

  } catch (error: any) {
    console.error("Error in Gemini API route:", error);
    return NextResponse.json({ 
      error: error.message || 'An internal server error occurred' 
    }, { status: 500 });
  }
}

// For batch processing
export async function PUT(request: NextRequest) {
  try {
    const reqBody = await request.json();
    const { prompt, items, screeningType, apiKey } = reqBody;

    if (!prompt || !items || !Array.isArray(items)) {
      return NextResponse.json({ error: 'Prompt and items array are required' }, { status: 400 });
    }

    if (!apiKey) {
      return NextResponse.json({ error: 'Gemini API key is required' }, { status: 400 });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: MODEL_NAME });

    const generationConfig = {
      temperature: 0.7,
      topK: 40,
      topP: 0.8,
      maxOutputTokens: 1024,
    };

    // Process items sequentially to avoid rate limiting
    const results: any[] = [];
    for (const item of items) {
      try {
        // Modify the prompt to request JSON response
        let jsonPrompt = prompt.replace('{text}', item.text);
        
        // Add instructions for JSON output based on screening type
        if (screeningType === 'title' || screeningType === 'abstract') {
          jsonPrompt += "\n\nProvide your response in JSON format with the following structure:\n" +
                      "{\n" +
                      "  \"decision\": \"INCLUDE\", \"EXCLUDE\", or \"MAYBE\",\n" +
                      "  \"confidence\": a number between 0 and 1,\n" +
                      "  \"reasoning\": \"Your reasoning for this decision\"\n" +
                      "}\n\n" +
                      "Ensure your response is valid JSON that can be parsed directly.";
        }

        const result = await model.generateContent({
          contents: [{ role: "user", parts: [{ text: jsonPrompt }] }],
          generationConfig,
        });

        if (result.response) {
          const responseText = result.response.text();
          console.log("Prompt:", jsonPrompt);
          console.log("ResponseText:", responseText);
          
          // Try to parse the response as JSON
          try {
            let jsonStr = responseText;
            // Extract JSON from the response if it's wrapped in markdown code blocks
            const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/);
            if (jsonMatch) {
              jsonStr = jsonMatch[1].trim();
            }
        
            const parsedResponse = JSON.parse(jsonStr);
            results.push({
              id: item.id,
              raw: responseText,
              parsed: parsedResponse,
              decision: parsedResponse.decision,
              confidence: parsedResponse.confidence,
              reasoning: parsedResponse.reasoning,
              screeningType: screeningType
            });
          } catch (parseError) {
            console.warn(`Failed to parse Gemini response as JSON for item ${item.id}:`, parseError);
            console.log("Prompt:", jsonPrompt);
            console.log("ResponseText:", responseText);
            // Fallback to extracting information from raw text
            const decisionMatch = responseText.match(/(INCLUDE|EXCLUDE|MAYBE)/i);
            const decision = decisionMatch ? decisionMatch[1].toUpperCase() : 'MAYBE';
            const confidence = 0.5; // Default confidence
            const reasoning = responseText; // Use the whole response as reasoning

            results.push({
              id: item.id,
              raw: responseText,
              parsed: null,
              decision: decision,
              confidence: confidence,
              reasoning: reasoning,
              screeningType: screeningType,
              error: "Failed to parse response as JSON"
            });
          }
        } else {
          results.push({
            id: item.id,
            error: 'Failed to get response from Gemini',
            details: { blockReason: 'Response was empty or blocked' },
            screeningType: screeningType
          });
        }
      } catch (itemError: any) {
        console.error(`Error processing item ${item.id}:`, itemError);
        results.push({
          id: item.id,
          error: itemError.message || 'An error occurred processing this item',
          screeningType: screeningType
        });
      }

      // Add a small delay between requests to avoid rate limiting
      // Add a dynamic delay between requests to avoid rate limiting
      const delay = Math.min(100 * items.length, 2000); // Maximum delay of 2 seconds
      await new Promise(resolve => setTimeout(resolve, delay));
    }

    return NextResponse.json({ results });
  } catch (error: any) {
    console.error("Error in Gemini batch processing:", error);
    return NextResponse.json({ 
      error: error.message || 'An internal server error occurred' 
    }, { status: 500 });
  }
}
