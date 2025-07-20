// const { GoogleGenerativeAI } = require('@google/generative-ai');
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
dotenv.config();
// Initialize Gemini API
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

/**
 * Get AI-powered performance analysis using Gemini
 * @param {Object} userData - Data about user tasks and performance
 * @returns {Promise<Object>} - AI analysis results
 */
export const getGeminiAnalysis = async (userData) => {
  try {
    // Configure the model
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
    
    // Prepare the prompt
    const prompt = `
    You are an AI assistant specialized in analyzing project management data and providing insights on team member performance.
    
    Analyze the following user data and provide:
    1. A performance score from 0-100
    2. A productivity rating from 0-10
    3. A response time assessment (Fast, Average, Slow)
    4. 3-5 strengths of the user
    5. 2-4 areas for improvement
    6. A paragraph of performance insights
    7. 3-5 actionable recommendations
    
    User Data: ${JSON.stringify(userData, null, 2)}
    
    Format your response as a valid JSON object with the following structure only:
    {
      "performanceScore": number,
      "productivity": number,
      "responseTime": string,
      "strengths": [strings],
      "improvements": [strings],
      "insights": string,
      "recommendations": [strings]
    }
    
    Return only the JSON object with no additional text.
    `;

    // Generate content with Gemini
    const result = await model.generateContent(prompt);
    const response = result.response;
    const text = response.text();
    
    try {
      // Extract the JSON from the response - Gemini sometimes adds extra text
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      
      // If no JSON pattern found, try parsing the whole response
      return JSON.parse(text);
    } catch (parseError) {
      console.error('Error parsing Gemini response:', parseError);
      // Return a default structure if parsing fails
      return calculateDefaultMetrics(userData);
    }
  } catch (error) {
    console.error('Error calling Gemini API:', error);
    // Return a basic analysis based on available metrics if AI fails
    return calculateDefaultMetrics(userData);
  }
};

/**
 * Calculate default metrics based on user data when AI fails
 * @param {Object} userData - Data about user tasks and performance
 * @returns {Object} - Default metrics
 */
const calculateDefaultMetrics = (userData) => {
  const { completionRate, totalTasks, avgProgress, onTimeCompletions, overdueCount, username } = userData;
  
  return {
    performanceScore: Math.round((completionRate + avgProgress) / 2),
    productivity: Math.min(Math.round((completionRate / 10) + (onTimeCompletions / Math.max(totalTasks, 1) * 5)), 10),
    responseTime: overdueCount > totalTasks / 3 ? 'Slow' : 'Average',
    strengths: ['Task completion', 'Project engagement'],
    improvements: ['Meeting deadlines', 'Progress reporting'],
    insights: `${username} has completed ${userData.completedTasks} out of ${totalTasks} assigned tasks with an average progress of ${avgProgress}%.`,
    recommendations: [
      'Focus on completing current tasks before taking on new ones',
      'Update task progress more frequently',
      'Prioritize tasks with upcoming deadlines'
    ]
  };
};