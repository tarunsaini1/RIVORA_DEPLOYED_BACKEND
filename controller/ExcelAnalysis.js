import xlsx from 'xlsx';
import File from '../models/FileSchema.js';
import mongoose from 'mongoose';
import fetch from 'node-fetch';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export const analyzeExcelFile = async (req, res) => {
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

    // Check permissions
    const hasAccess = await File.userHasAccess(fileId, userId);
    if (!hasAccess) {
      return res.status(403).json({ message: 'You do not have permission to access this file' });
    }

    // Verify it's an Excel file
    const fileType = file.type.toLowerCase();
    const isExcel = 
      fileType.includes('spreadsheet') || 
      fileType.includes('excel') || 
      fileType.includes('xls') ||
      fileType.includes('xlsx') ||
      fileType.includes('csv') ||
      file.name.toLowerCase().endsWith('.xlsx') || 
      file.name.toLowerCase().endsWith('.xls') ||
      file.name.toLowerCase().endsWith('.csv');

    if (!isExcel) {
      return res.status(400).json({ message: 'File is not an Excel/spreadsheet file' });
    }

    // Start processing
    file.isProcessed = false;
    file.processingError = null;
    await file.save();

    // Get file content
    const fileResponse = await fetch(file.url);
    if (!fileResponse.ok) {
      throw new Error(`Failed to fetch file from storage: ${fileResponse.statusText}`);
    }

    // Parse Excel file
    const buffer = await fileResponse.arrayBuffer();
    const excelData = await parseExcelForAnalysis(buffer);

    // Check for Excel inconsistencies and optimization
    const excelIssues = checkExcelInconsistencies(excelData);
    
    // Generate AI analysis
    const aiAnalysis = await generateExcelAiAnalysis(excelData, file.name);

    // Combine all analysis results
    const completeAnalysis = {
      ...excelData.summary,
      ...excelIssues,

       inconsistencies: [
            ...(excelIssues.inconsistencies || []),
            ...(Array.isArray(aiAnalysis.insights?.dataInconsistencies) ? 
            aiAnalysis.insights.dataInconsistencies : [])
        ],
        optimizationSuggestions: [
            ...(excelIssues.optimizationSuggestions || []),
            ...(Array.isArray(aiAnalysis.insights?.optimizationSuggestions) ? 
            aiAnalysis.insights.optimizationSuggestions : [])
        ],

      dataSummary: aiAnalysis.insights?.datasetSummary || "No summary available",
      keyInsights: Array.isArray(aiAnalysis.insights?.keyInsights) ? 
        aiAnalysis.insights.keyInsights : [],
      dataQueries: Array.isArray(aiAnalysis.insights?.suggestedQueries) ? 
        aiAnalysis.insights.suggestedQueries : [],
      formulaTips: Array.isArray(aiAnalysis.insights?.formulaSuggestions) ? 
        aiAnalysis.insights.formulaSuggestions : [],
      visualizations: Array.isArray(aiAnalysis.insights?.visualizationIdeas) ? 
        aiAnalysis.insights.visualizationIdeas : [],
      advancedFeatures: Array.isArray(aiAnalysis.insights?.advancedFeatures) ? 
        aiAnalysis.insights.advancedFeatures : [],
      cleaningTips: Array.isArray(aiAnalysis.insights?.dataCleaning) ? 
        aiAnalysis.insights.dataCleaning : [],
       fullAnalysisText: aiAnalysis.fullText || "", // Save the full text as a fallback
      processedAt: new Date()
    };

    // Update the file with Excel analysis
    file.excelAnalysis = completeAnalysis;
    file.aiInsights = aiAnalysis.insights;  // Store insights in aiInsights field too for consistency
    file.isProcessed = true;
    await file.save();

    res.status(200).json({ 
      message: 'Excel file analyzed successfully',
      fileId: file._id,
      excelAnalysis: completeAnalysis,
      insights: aiAnalysis.insights
    });

  } catch (error) {
    console.error('Excel analysis error:', error);
    
    // Update file error status
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
      message: 'Failed to analyze Excel file',
      error: error.message
    });
  }
};

// Function to parse Excel file and extract data for analysis
async function parseExcelForAnalysis(buffer) {
  try {
    // Parse Excel file
    const workbook = xlsx.read(buffer, { type: 'buffer' });
    const sheetNames = workbook.SheetNames;
    
    // Summary information
    const summary = {
      sheetCount: sheetNames.length,
      rowCount: 0,
      columnCount: 0,
      formulaCount: 0,
      hasFormulas: false,
      hasPivotTables: false
    };

    // Process each sheet
    const sheets = [];
    const formulaCells = [];
    const allDataSamples = {};
    
    for (const sheetName of sheetNames) {
      const sheet = workbook.Sheets[sheetName];
      
      // Convert to JSON for easier processing
      const jsonData = xlsx.utils.sheet_to_json(sheet);
      
      // Find column headers
      const headers = jsonData.length > 0 ? Object.keys(jsonData[0]) : [];
      
      // Get row and column count
      const rowCount = jsonData.length;
      const columnCount = headers.length;
      
      // Increment total counts
      summary.rowCount += rowCount;
      summary.columnCount = Math.max(summary.columnCount, columnCount);
      
      // Check for formulas
      let sheetFormulaCount = 0;
      for (const cellAddress in sheet) {
        if (cellAddress[0] !== '!') { // Skip special keys
          const cell = sheet[cellAddress];
          if (cell.f) {
            sheetFormulaCount++;
            formulaCells.push({
              sheet: sheetName,
              cell: cellAddress,
              formula: cell.f
            });
          }
        }
      }
      
      summary.formulaCount += sheetFormulaCount;
      if (sheetFormulaCount > 0) summary.hasFormulas = true;
      
      // Check for pivot tables (basic detection)
      if (sheet['!pivotAreas'] || (jsonData.some(row => 
        Object.values(row).some(val => 
          typeof val === 'string' && 
          val.includes('Grand Total')
        )
      ))) {
        summary.hasPivotTables = true;
      }
      
      // Collect data samples (limited to 10 rows)
      const sampleData = jsonData.slice(0, 10);
      
      // Add sheet info
      sheets.push({
        name: sheetName,
        rowCount,
        columnCount,
        headers,
        sampleData
      });
      
      // Store data samples
      allDataSamples[sheetName] = sampleData;
    }
    
    return {
      summary,
      sheets,
      formulaCells,
      dataSamples: allDataSamples
    };
  } catch (error) {
    console.error('Excel parsing error:', error);
    throw new Error(`Failed to parse Excel file: ${error.message}`);
  }
}

// Check Excel file for inconsistencies and optimization opportunities
function checkExcelInconsistencies(excelData) {
  const inconsistencies = [];
  const optimizationSuggestions = [];
  
  // Check sheet consistency
  if (excelData.sheets.length > 1) {
    // Check for empty sheets
    const emptySheets = excelData.sheets.filter(sheet => sheet.rowCount === 0);
    if (emptySheets.length > 0) {
      inconsistencies.push(`Found ${emptySheets.length} empty sheet(s): ${emptySheets.map(s => s.name).join(', ')}`);
      optimizationSuggestions.push('Remove empty sheets to reduce file size');
    }
  }
  
  // Check formula complexity
  if (excelData.summary.formulaCount > 100) {
    optimizationSuggestions.push('Large number of formulas detected. Consider using tables or consolidating calculations');
  }
  
  // Check for inconsistent data formats
  for (const sheet of excelData.sheets) {
    if (sheet.sampleData.length > 1) {
      const firstRow = sheet.sampleData[0];
      // Check for type inconsistencies in columns
      for (const header of sheet.headers) {
        const firstType = typeof firstRow[header];
        const inconsistentTypes = sheet.sampleData.filter(row => 
          row[header] !== null && 
          row[header] !== undefined && 
          typeof row[header] !== firstType
        );
        
        if (inconsistentTypes.length > 0) {
          inconsistencies.push(`Inconsistent data types in column "${header}" in sheet "${sheet.name}"`);
        }
      }
      
      // Check for potential missing values
      const potentialMissingValues = sheet.headers.filter(header => 
        sheet.sampleData.some(row => row[header] === null || row[header] === undefined)
      );
      
      if (potentialMissingValues.length > 0) {
        inconsistencies.push(`Potential missing values in columns: ${potentialMissingValues.join(', ')} in sheet "${sheet.name}"`);
      }
    }
  }
  
  // Add general optimization suggestions
  if (excelData.summary.sheetCount > 10) {
    optimizationSuggestions.push('Consider consolidating data across multiple sheets for better organization');
  }
  
  if (excelData.summary.hasFormulas) {
    optimizationSuggestions.push('Use named ranges to make formulas more readable and maintainable');
    optimizationSuggestions.push('Consider using structured references with Excel tables for better formula clarity');
  }
  
  return {
    inconsistencies,
    optimizationSuggestions
  };
}

// Generate AI analysis for the Excel file
async function generateExcelAiAnalysis(excelData, fileName) {
  // Setup Gemini model
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
  
  // Create a simplified version of the data for the AI
  const simplifiedData = {
    fileName,
    sheetCount: excelData.summary.sheetCount,
    sheets: excelData.sheets.map(sheet => ({
      name: sheet.name,
      headers: sheet.headers,
      rowCount: sheet.rowCount,
      sampleData: sheet.sampleData.slice(0, 5) // Limit to 5 rows for prompt size
    }))
  };
  
  // Create prompt for Excel analysis
  const analysisPrompt = `
    You are an Excel and data analysis expert. Analyze the following Excel file data:
    
    File: "${fileName}"
    Number of Sheets: ${excelData.summary.sheetCount}
    Total Rows: ${excelData.summary.rowCount}
    Contains Formulas: ${excelData.summary.hasFormulas ? 'Yes' : 'No'}
    Contains Pivot Tables: ${excelData.summary.hasPivotTables ? 'Yes' : 'No'}
    
    Sheet details:
    ${excelData.sheets.map(sheet => `
      Sheet: "${sheet.name}"
      Rows: ${sheet.rowCount}
      Columns: ${sheet.columnCount}
      Headers: ${sheet.headers.join(', ')}
      
      Sample Data (first few rows):
      ${JSON.stringify(sheet.sampleData.slice(0, 3), null, 2)}
    `).join('\n\n')}
    
    Please provide the following analysis:
    1. Dataset summary - what kind of data is this and what is its purpose?
    2. Key insights - what are the most important patterns or findings?
    3. Suggested queries - what questions could be answered with this data?
    4. Excel formula suggestions - what formulas would be helpful for analyzing this data?
    5. Data visualization recommendations - what charts would best represent this data?
    6. Advanced Excel features that could be useful (PivotTables, Power Query, etc.)
    
    Format your response as JSON with the following structure:
    {
      "datasetSummary": "Concise description of the data and its purpose",
      "keyInsights": ["Insight 1", "Insight 2", "Insight 3"],
      "suggestedQueries": ["Query 1", "Query 2", "Query 3"],
      "formulaSuggestions": ["Formula suggestion 1", "Formula suggestion 2"],
      "visualizationIdeas": ["Chart recommendation 1", "Chart recommendation 2"],
      "advancedFeatures": ["Feature recommendation 1", "Feature recommendation 2"],
      "dataCleaning": ["Data cleaning tip 1", "Data cleaning tip 2"],
      "dataInconsistencies": ["Inconsistency 1", "Inconsistency 2"],
      "optimizationSuggestions": ["Optimization 1", "Optimization 2"]
    }
  `;

  try {
    // Generate analysis
    const result = await model.generateContent(analysisPrompt);
    const response = result.response;
    let analysisText = response.text();
    console.log('AI analysis:', analysisText);
    
    // Extract JSON from response
    let insights;
    try {
      const jsonMatch = analysisText.match(/```json\s*({[\s\S]*?})\s*```/) || 
                        analysisText.match(/{[\s\S]*?}/);
      
      if (jsonMatch) {
        // First attempt to parse the original JSON
        try {
          insights = JSON.parse(jsonMatch[1] || jsonMatch[0]);
        } catch (parseError) {
          console.log('Initial parsing failed, attempting to fix malformed JSON');
          
          // Try to fix common JSON format issues
          let fixedJson = (jsonMatch[1] || jsonMatch[0])
            // Fix issues with formulas as keys
            .replace(/"=([^"]+)":/g, '"Formula: =$1":')
            // Fix trailing commas in arrays
            .replace(/,(\s*[\]}])/g, '$1')
            // Fix missing commas between elements
            .replace(/}(\s*){/g, '},\n$1{')
            // Fix quotes within quotes issue
            .replace(/": "([^"]*)"([^"]*)"([^"]*)"/g, '": "$1\'$2\'$3"');
            
          console.log('Fixed JSON attempt:', fixedJson);
          insights = JSON.parse(fixedJson);
        }
      } else {
        throw new Error('No valid JSON found in AI response');
      }
    } catch (jsonError) {
      console.error('Error parsing AI response as JSON:', jsonError);
      
      // Create a fallback structure and extract data using regex patterns
      insights = {
            datasetSummary: extractSummary(analysisText),
            keyInsights: extractListItems(analysisText, "Key insights"),
            suggestedQueries: extractListItems(analysisText, "Suggested queries"),
            formulaSuggestions: extractFormulas(analysisText),
            visualizationIdeas: extractListItems(analysisText, "visualization"),
            advancedFeatures: extractListItems(analysisText, "Advanced Excel features"),
            dataCleaning: extractListItems(analysisText, "Data cleaning"),
            dataInconsistencies: extractListItems(analysisText, "Data inconsistencies"),
            optimizationSuggestions: extractListItems(analysisText, "Optimization suggestions")
         };
    }

    console.log('AI insights:', insights);
    
    return { insights };
  } catch (error) {
    console.error('AI analysis error:', error);
    throw new Error(`Failed to generate AI analysis: ${error.message}`);
  }
}

// Add these helper functions to extract information from text when JSON parsing fails
function extractSummary(text) {
  const summaryMatch = text.match(/dataset summary[^\n]*:\s*"([^"]+)"/i) || 
                       text.match(/dataset summary[^\n]*:(.+?)(?=\d+\.|$)/is);
  return summaryMatch ? summaryMatch[1].trim() : "Could not generate dataset summary";
}

function extractListItems(text, sectionName) {
  // Look for lists like "1. Item", "- Item", "• Item", etc.
  const sectionRegex = new RegExp(`${sectionName}[^\\n]*:.+?\\[(.*?)\\]`, 'is');
  const sectionMatch = text.match(sectionRegex);
  
  if (sectionMatch) {
    // Try to extract items from array format
    try {
      const arrayText = `[${sectionMatch[1]}]`;
      return JSON.parse(arrayText);
    } catch (e) {
      // Fallback to regex extraction
      const items = [];
      const itemRegex = /"([^"]+)"/g;
      let match;
      while ((match = itemRegex.exec(sectionMatch[1])) !== null) {
        items.push(match[1]);
      }
      return items;
    }
  }
  
  // Alternative - look for numbered/bulleted lists
  const listRegex = new RegExp(`${sectionName}[^\\n]*:\\s*(?:\\n|.)*?(?:(?:(?:\\d+|\\*|-)\\s+([^\\n]+)\\n?)+)`, 'i');
  const listMatch = text.match(listRegex);
  
  if (listMatch) {
    const items = [];
    const itemRegex = /(?:\d+|[\*\-])\s+([^\n]+)/g;
    let match;
    while ((match = itemRegex.exec(listMatch[0])) !== null) {
      items.push(match[1].trim());
    }
    return items;
  }
  
  return [];
}

function extractFormulas(text) {
  const formulas = [];
  
  // Look for formula patterns
  const formulaRegex = /=\w+\([^)]*\)/g;
  const fullFormulaMatch = text.match(/formula[^\n]*:.+?(\[.*?\])/is);
  
  if (fullFormulaMatch) {
    try {
      return JSON.parse(fullFormulaMatch[1]);
    } catch (e) {
      // Continue with regex extraction
    }
  }
  
  let match;
  while ((match = formulaRegex.exec(text)) !== null) {
    // Get the formula and description if available
    const formula = match[0];
    const description = text.substring(match.index, text.indexOf('\n', match.index)).trim();
    formulas.push(description.length > formula.length ? description : formula);
  }
  
  // If no formulas found with regex, look for quoted items in the formula section
  if (formulas.length === 0) {
    const formulaSection = text.match(/formula suggestions[^\n]*:.+?(\[.*?\])/is);
    if (formulaSection) {
      const quotedItems = formulaSection[0].match(/"([^"]+)"/g);
      if (quotedItems) {
        return quotedItems.map(item => item.replace(/^"|"$/g, ''));
      }
    }
  }
  
  return formulas;
}

export default {
  analyzeExcelFile
};