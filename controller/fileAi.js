import { GoogleGenerativeAI } from '@google/generative-ai';
import fetch from 'node-fetch';
import File from '../models/FileSchema.js';
import mongoose from 'mongoose';
import { parseDocument } from '../utils/documentParser.js';
import { extractImageContent } from '../utils/imageParser.js';
import { parsePdf } from '../utils/pdfParser.js';

// Initialize Gemini AI with your API key
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export const analyzeFile = async (req, res) => {
  try {
    const { fileId } = req.params;
    const userId = req.user._id;

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(fileId)) {
      return res.status(400).json({ message: 'Invalid file ID' });
    }

    // Find the file
    const file = await File.findById(fileId);
    if (!file) {
      return res.status(404).json({ message: 'File not found' });
    }

    // Check permissions (using the userHasAccess static method)
    const hasAccess = await File.userHasAccess(fileId, userId);
    if (!hasAccess) {
      return res.status(403).json({ message: 'You do not have permission to access this file' });
    }

    // Start processing
    file.isProcessed = false;
    file.processingError = null;
    await file.save();

    // Get file content from Vercel Blob
    const fileResponse = await fetch(file.url);
    if (!fileResponse.ok) {
      throw new Error(`Failed to fetch file from storage: ${fileResponse.statusText}`);
    }

    // Extract and process content based on file type
    let content = '';
    const fileType = file.type.toLowerCase();

    if (fileType.includes('pdf')) {
      const buffer = await fileResponse.arrayBuffer();
      content = await parsePdf(buffer);
    } 
    else if (fileType.startsWith('image/')) {
      const buffer = await fileResponse.arrayBuffer();
      content = await extractImageContent(buffer);
    } 
    else if (
      fileType.includes('document') || 
      fileType.includes('text') || 
      fileType.includes('msword') ||
      fileType.includes('officedocument')
    ) {
      const buffer = await fileResponse.arrayBuffer();
      content = await parseDocument(buffer, fileType);
    } 
    else {
      // For plain text or unknown formats
      content = await fileResponse.text();
    }

    // Setup Gemini model
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });

    // Create prompt for analysis
    const analysisPrompt = `
      You are an expert document and content analyzer. Analyze the following content from a file named "${file.name}" (type: ${file.type}).
      
      Content:
      "${content.slice(0, 15000)}" ${content.length > 15000 ? '... (content truncated due to length)' : ''}
      
      Provide a comprehensive analysis of this content with:
      1. A concise summary of the main content (1-3 paragraphs)
      2. 3-7 key points extracted from the content
      3. The overall sentiment (positive, negative, neutral, or mixed)
      4. Relevant tags or keywords (3-8 tags)
      5. Any structured data that could be extracted (like dates, names, metrics, etc.)
      
      Format your response as JSON with the following structure:
      {
        "summary": "Concise summary here",
        "keyPoints": ["Point 1", "Point 2", "Point 3"],
        "sentiment": "positive/negative/neutral/mixed",
        "tags": ["tag1", "tag2", "tag3"],
        "extractedData": {
          // Any structured data you can extract
        }
      }
    `;

    // Generate analysis
    const result = await model.generateContent(analysisPrompt);
    const response = result.response;
    let analysisText = response.text();

    // Extract JSON from the response
    let aiInsights;
    try {
      // Look for JSON in the response
      const jsonMatch = analysisText.match(/```json\s*({[\s\S]*?})\s*```/) || 
                        analysisText.match(/{[\s\S]*?}/);
      
      if (jsonMatch) {
        aiInsights = JSON.parse(jsonMatch[1] || jsonMatch[0]);
      } else {
        throw new Error('No valid JSON found in AI response');
      }
    } catch (jsonError) {
      console.error('Error parsing AI response as JSON:', jsonError);
      
      // Fallback to structured extraction
      aiInsights = {
        summary: extractSummary(analysisText),
        keyPoints: extractKeyPoints(analysisText),
        sentiment: extractSentiment(analysisText),
        tags: extractTags(analysisText),
        extractedData: {}
      };
    }

    // Update the file with AI insights
    file.aiInsights = {
      ...aiInsights,
      processedAt: new Date()
    };
    file.isProcessed = true;
    await file.save();

    res.status(200).json({ 
      message: 'File analyzed successfully',
      fileId: file._id,
      insights: file.aiInsights
    });

  } catch (error) {
    console.error('AI analysis error:', error);
    
    // If we have a fileId, update the file's error status
    if (req.params.fileId && mongoose.Types.ObjectId.isValid(req.params.fileId)) {
      try {
        await File.findByIdAndUpdate(req.params.fileId, {
          isProcessed: true,
          processingError: error.message
        });
      } catch (dbError) {
        console.error('Error updating file processing status:', dbError);
      }
    }
    
    res.status(500).json({ 
      message: 'Failed to analyze file',
      error: error.message
    });
  }
};

// Helper functions for fallback parsing
function extractSummary(text) {
  const summaryMatch = text.match(/summary:?\s*([\s\S]*?)(?=key\s*points:|sentiment:|tags:|$)/i);
  return summaryMatch ? summaryMatch[1].trim() : 'No summary available';
}

function extractKeyPoints(text) {
  const keyPointsSection = text.match(/key\s*points:?\s*([\s\S]*?)(?=sentiment:|tags:|$)/i);
  if (!keyPointsSection) return ['No key points available'];
  
  const points = keyPointsSection[1].match(/[-•*]\s*(.*?)(?=[-•*]|$)/g) || 
                 keyPointsSection[1].split(/\d+\.\s+/);
                 
  return points
    .map(p => p.replace(/[-•*]\s*/, '').trim())
    .filter(p => p.length > 0)
    .slice(0, 7);
}

function extractSentiment(text) {
  const sentimentMatch = text.match(/sentiment:?\s*(positive|negative|neutral|mixed)/i);
  return sentimentMatch ? sentimentMatch[1].toLowerCase() : 'neutral';
}

function extractTags(text) {
  const tagsSection = text.match(/tags:?\s*([\s\S]*?)(?=extracted\s*data:|$)/i);
  if (!tagsSection) return [];
  
  const tags = tagsSection[1].match(/[-•*]\s*(.*?)(?=[-•*]|$)/g) || 
               tagsSection[1].split(/,\s*/);
               
  return tags
    .map(t => t.replace(/[-•*"'\[\]]/g, '').trim())
    .filter(t => t.length > 0)
    .slice(0, 8);
}

export default {
  analyzeFile
};