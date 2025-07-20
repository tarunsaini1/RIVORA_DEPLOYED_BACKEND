import mammoth from 'mammoth';
import textract from 'textract';
import { promisify } from 'util';

// Convert textract to use promises
const extractTextPromise = promisify(textract.fromBufferWithMime);

export async function parseDocument(buffer, mimeType) {
  try {
    if (mimeType.includes('officedocument.wordprocessingml') || 
        mimeType.includes('msword')) {
      // For Word documents
      const result = await mammoth.extractRawText({ buffer });
      return result.value;
    }
    
    // For other document types
    const text = await extractTextPromise(mimeType, buffer);
    return text;
  } catch (error) {
    console.error('Error parsing document:', error);
    throw new Error(`Failed to parse document: ${error.message}`);
  }
}