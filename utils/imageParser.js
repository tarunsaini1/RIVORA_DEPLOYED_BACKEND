import { GoogleGenerativeAI } from '@google/generative-ai';

// Initialize Gemini AI with your API key
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export async function extractImageContent(buffer) {
  try {
    // For image content, we'll use Gemini's vision model
    const model = genAI.getGenerativeModel({ model: "gemini-pro-vision" });
    
    // Convert buffer to base64
    const base64Image = buffer.toString('base64');
    
    // Create a Part to use in the generation request
    const imageParts = [
      {
        inlineData: {
          data: base64Image,
          mimeType: "image/jpeg" // Adjust if needed
        }
      }
    ];

    // Generate description of the image
    const result = await model.generateContent([
      "Please describe this image in detail, including any visible text, objects, people, and other relevant information.", 
      ...imageParts
    ]);

    return result.response.text();
  } catch (error) {
    console.error('Error processing image:', error);
    throw new Error(`Failed to process image: ${error.message}`);
  }
}