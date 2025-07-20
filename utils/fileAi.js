import axios from 'axios';
import { get } from '@vercel/blob/api';
import File from '../models/FileSchema.js';

// Main function to analyze files
export const analyzeFile = async (fileId) => {
  try {
    // Get the file record
    const file = await File.findById(fileId);
    if (!file) {
      throw new Error('File not found');
    }
    
    // Skip if already processed
    if (file.isProcessed) {
      return file.aiInsights;
    }
    
    // Mark as processing
    await File.findByIdAndUpdate(fileId, {
      isProcessed: false,
      processingError: null
    });
    
    // Get the file content from Vercel Blob
    const blob = await get(file.url);
    
    if (!blob) {
      throw new Error('Failed to retrieve file from storage');
    }
    
    // Process based on file type
    let insights;
    
    if (file.type.startsWith('image/')) {
      // Process image
      insights = await processImage(blob.url, file.name);
    } else if (file.type === 'application/pdf') {
      // Process PDF
      insights = await processDocument(blob.url, file.name);
    } else if (file.type.startsWith('text/') || 
               file.type.includes('document') || 
               file.type.includes('sheet') || 
               file.type.includes('presentation')) {
      // Process text-based documents
      insights = await processText(blob.url, file.name);
    } else {
      // Generic processing for unsupported types
      insights = {
        summary: `File named ${file.name} (${formatFileSize(file.size)})`,
        keyPoints: ['File analysis not supported for this type'],
        sentiment: 'neutral',
        tags: [getFileExtension(file.name)],
        extractedData: {}
      };
    }
    
    // Update the file with AI insights
    await File.findByIdAndUpdate(fileId, {
      aiInsights: {
        ...insights,
        processedAt: new Date()
      },
      isProcessed: true
    });
    
    return insights;
  } catch (error) {
    console.error('Error processing file with AI:', error);
    
    // Update file record with error info
    await File.findByIdAndUpdate(fileId, {
      processingError: error.message
    });
    
    throw error;
  }
};

// Process text documents
async function processText(fileUrl, fileName) {
  try {
    // You can integrate with OpenAI API or another AI service here
    // For now, we'll simulate a response
    
    return {
      summary: `This is a text document named ${fileName}`,
      keyPoints: [
        'Contains textual information',
        'File appears to be a document',
        'Further analysis would require content extraction'
      ],
      sentiment: 'neutral',
      tags: ['document', 'text', getFileExtension(fileName)],
      extractedData: {
        fileType: getFileExtension(fileName),
        wordEstimate: 'Unknown without content extraction'
      }
    };
    
    /* 
    // Example OpenAI integration:
    const content = await downloadAndExtractText(fileUrl);
    
    const response = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        {
          role: "system", 
          content: "You are an assistant that analyzes documents and provides insights."
        },
        {
          role: "user", 
          content: `Analyze this document and provide the following:
           1. A brief summary (max 100 words)
           2. 3-5 key points
           3. Overall sentiment (positive, negative, or neutral)
           4. 3-5 relevant tags
           
           Document content: ${content.substring(0, 4000)}`
        }
      ],
    });
    
    // Parse the response and structure it
    const analysisText = response.choices[0].message.content;
    
    // Parse the structured data from the AI response
    // This is a simplified parser
    const summary = analysisText.match(/Summary:(.*?)(?=Key points:|$)/s)?.[1]?.trim();
    const keyPointsText = analysisText.match(/Key points:(.*?)(?=Sentiment:|$)/s)?.[1];
    const keyPoints = keyPointsText
      ? keyPointsText.split(/\d+\./).filter(point => point.trim()).map(point => point.trim())
      : [];
    const sentiment = analysisText.match(/Sentiment:(.*?)(?=Tags:|$)/s)?.[1]?.trim().toLowerCase();
    const tagsText = analysisText.match(/Tags:(.*?)(?=$)/s)?.[1];
    const tags = tagsText
      ? tagsText.split(',').map(tag => tag.trim())
      : [];
    
    return {
      summary,
      keyPoints,
      sentiment,
      tags,
      extractedData: {
        wordCount: content.split(/\s+/).length,
        charCount: content.length
      }
    };
    */
  } catch (error) {
    console.error('Error processing text document:', error);
    return generateFallbackInsights(fileName);
  }
}

// Process images
async function processImage(fileUrl, fileName) {
  try {
    // Simulated response for images
    return {
      summary: `Image file: ${fileName}`,
      keyPoints: [
        'Visual content',
        'Image format: ' + getFileExtension(fileName)
      ],
      sentiment: 'neutral',
      tags: ['image', getFileExtension(fileName)],
      extractedData: {
        format: getFileExtension(fileName),
      }
    };
    
    /* 
    // Example integration with an AI vision API
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: "gpt-4-vision-preview",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Describe this image in detail. What's the main subject? What are key elements? Provide tags that describe the image content."
              },
              {
                type: "image_url",
                image_url: {
                  url: fileUrl
                }
              }
            ]
          }
        ]
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
        }
      }
    );
    
    const analysisText = response.data.choices[0].message.content;
    
    // Extract information from the analysis
    const summary = analysisText.substring(0, 150) + '...';
    const keyPoints = analysisText
      .split('.')
      .filter(sentence => sentence.trim().length > 15)
      .map(sentence => sentence.trim())
      .slice(0, 3);
      
    const tags = extractTags(analysisText);
    
    return {
      summary,
      keyPoints,
      sentiment: determineSentiment(analysisText),
      tags,
      extractedData: {
        imageType: getFileExtension(fileName),
        description: analysisText
      }
    };
    */
  } catch (error) {
    console.error('Error processing image:', error);
    return generateFallbackInsights(fileName);
  }
}

// Process PDF documents
async function processDocument(fileUrl, fileName) {
  try {
    // Simulated response for PDFs
    return {
      summary: `PDF document: ${fileName}`,
      keyPoints: [
        'PDF document',
        'May contain text and images',
        'Analysis requires content extraction'
      ],
      sentiment: 'neutral',
      tags: ['pdf', 'document'],
      extractedData: {
        format: 'PDF'
      }
    };
    
    // You can integrate with PDF text extraction libraries
    // and then process the extracted text with AI
  } catch (error) {
    console.error('Error processing PDF:', error);
    return generateFallbackInsights(fileName);
  }
}

// Helper functions
function getFileExtension(filename) {
  return filename.split('.').pop().toLowerCase();
}

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' bytes';
  else if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  else return (bytes / 1048576).toFixed(1) + ' MB';
}

function generateFallbackInsights(fileName) {
  return {
    summary: `File: ${fileName}`,
    keyPoints: ['Unable to analyze this file automatically'],
    sentiment: 'neutral',
    tags: [getFileExtension(fileName)],
    extractedData: {}
  };
}

// Advanced helper functions for production use
function determineSentiment(text) {
  const positiveWords = ['good', 'great', 'excellent', 'positive', 'happy', 'beautiful'];
  const negativeWords = ['bad', 'poor', 'negative', 'sad', 'ugly', 'terrible'];
  
  let positiveCount = 0;
  let negativeCount = 0;
  
  const words = text.toLowerCase().split(/\W+/);
  
  words.forEach(word => {
    if (positiveWords.includes(word)) positiveCount++;
    if (negativeWords.includes(word)) negativeCount++;
  });
  
  if (positiveCount > negativeCount * 2) return 'positive';
  if (negativeCount > positiveCount * 2) return 'negative';
  return 'neutral';
}

function extractTags(text) {
  // A simple tag extraction algorithm
  const commonNouns = text.toLowerCase().match(/\b(image|photo|picture|document|text|file|data|information|content|chart|graph|table|list|report|analysis|summary|presentation)\b/g) || [];
  const uniqueNouns = [...new Set(commonNouns)];
  return uniqueNouns.slice(0, 5);
}