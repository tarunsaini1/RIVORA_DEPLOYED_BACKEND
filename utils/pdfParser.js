// Important: Import the preload file FIRST before pdf-parse
import './preLoad.js';
import pdfParse from 'pdf-parse';

/**
 * Parses a PDF buffer and extracts text content
 * @param {Buffer} buffer - The PDF file buffer
 * @returns {Promise<string>} - The extracted text
 */
export async function parsePdf(buffer) {
  try {
    // Simple options, no file references
    const options = { version: false };
    
    // Parse the PDF
    const data = await pdfParse(buffer, options);
    return data.text || '';
  } catch (error) {
    console.error('PDF parsing failed:', error);
    
    // Use fallback
    try {
      const text = buffer
        .toString('utf8')
        .replace(/^\s*%PDF-[\d.]+\s*$/gm, '')
        .replace(/\s+/g, ' ')
        .trim();
      
      return text || 'Unable to extract text from this PDF';
    } catch (fallbackError) {
      return 'This appears to be a PDF document, but text extraction failed';
    }
  }
}