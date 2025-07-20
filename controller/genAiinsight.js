import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import Project from '../models/Project.js';
import {Task} from '../models/TaskModel.js';

dotenv.config();

// Initialize the Google Generative AI with your API key
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

export const generateProjectAnalysis = async (projectId) => {
  try {
    // Fetch project with populated tasks
    const project = await Project.findById(projectId)
      .populate({
        path: 'tasks',
        model: 'Task',
        populate: {
          path: 'assignedTo',
          model: 'User',
          select: 'username'
        }
      })
      .lean();
    
    if (!project) {
      throw new Error('Project not found');
    }
    
    // Format project data for AI analysis - adjusted for your schema
    const projectData = {
      name: project.name,
      description: project.description,
      deadline: new Date(project.deadline).toLocaleDateString(),
      currentStatus: project.currentStatus,
      progress: project.progress,
      priority: project.priority,
      tasks: project.tasks ? project.tasks.map(task => ({
        title: task.title,
        status: task.status,
        priority: task.priority,
        // Handle potential missing fields
        assignedTo: task.assignedTo?.length ? task.assignedTo.map(user => 
          user?.username || 'Unassigned'
        ) : ['Unassigned'],
        progress: task.progress || 0,
        dueDate: task.dueDate ? new Date(task.dueDate).toLocaleDateString() : 'No due date'
      })) : []
    };
    
    // Calculate days until deadline
    const daysRemaining = Math.ceil((new Date(project.deadline) - new Date()) / (1000 * 60 * 60 * 24));
    
    // Generate workload analysis prompt
    const workloadPrompt = `
      Analyze this project's workload and team efficiency:
      Project: ${JSON.stringify(projectData, null, 2)}
      Days remaining until deadline: ${daysRemaining}
      
      Please provide a concise workload analysis focusing on:
      1. Team efficiency based on task progress
      2. Whether workload appears balanced or needs redistribution
      3. Any bottlenecks or issues that might be affecting progress
      4. Specific suggestions to improve efficiency
      
      Format your response in 3-5 short paragraphs using clear, professional language. 
      Keep total response under 200 words.
    `;
    
    // Generate risk analysis prompt
    const riskPrompt = `
      Analyze this project's risks based on current progress and deadline:
      Project: ${JSON.stringify(projectData, null, 2)}
      Days remaining until deadline: ${daysRemaining}
      
      Please provide a brief risk assessment focusing on:
      1. Likelihood of meeting the deadline based on current progress
      2. Key risk factors that could delay completion
      3. Potential bottlenecks or blockers
      4. Risk mitigation recommendations
      
      Format your response in 2-3 short paragraphs using clear, professional language.
      Keep total response under 150 words.
    `;
    
    // Generate recommendations prompt
    const recommendationsPrompt = `
      Based on this project's current state, provide tactical recommendations:
      Project: ${JSON.stringify(projectData, null, 2)}
      Days remaining until deadline: ${daysRemaining}
      
      Please provide 3-5 specific, actionable recommendations to:
      1. Improve project progress
      2. Address any obvious issues
      3. Better allocate resources or prioritize tasks
      
      Format your response as a bulleted list with brief explanations.
      Keep total response under 200 words.
    `;
    
    // Generate predicted completion date
    const predictedDatePrompt = `
      Based on this project's progress rate and status, predict a realistic completion date:
      Project: ${JSON.stringify(projectData, null, 2)}
      Official deadline: ${new Date(project.deadline).toLocaleDateString()}
      Days remaining: ${daysRemaining}
      Current progress: ${project.progress}%
      
      Please calculate and return ONLY a predicted completion date in this exact format: YYYY-MM-DD
      Do not include any other text or explanation in your response.
    `;
    
    // Run the analyses in parallel
    const [workloadResult, riskResult, recommendationsResult, predictedDateResult] = await Promise.all([
      model.generateContent(workloadPrompt).then(result => result.response.text()),
      model.generateContent(riskPrompt).then(result => result.response.text()),
      model.generateContent(recommendationsPrompt).then(result => result.response.text()),
      model.generateContent(predictedDatePrompt).then(result => result.response.text().trim())
    ]);
    
    // Parse the predicted date - with error handling
    let predictedDate;
    try {
      predictedDate = new Date(predictedDateResult);
      // Validate the date (check if it's a valid date)
      if (isNaN(predictedDate.getTime())) {
        console.warn('Invalid predicted date format received:', predictedDateResult);
        predictedDate = new Date(); // Fallback to current date
      }
    } catch (error) {
      console.error('Error parsing predicted date:', error);
      predictedDate = new Date(); // Fallback to current date
    }
    

    console.log('AI Analysis Results:', {
      workloadAnalysis: workloadResult,
      riskAnalysis: riskResult,
      recommendations: recommendationsResult,
      predictedDeadline: predictedDate
    });
    // Update the project with AI insights
    const updatedProject = await Project.findByIdAndUpdate(
      projectId,
      {
        'aiInsights.workloadAnalysis': workloadResult,
        'aiInsights.riskAnalysis': riskResult,
        'aiInsights.recommendation': recommendationsResult, // Keep this consistent
        'aiInsights.predictedDeadline': predictedDate,
        'aiInsights.lastUpdated': Date.now(),
        lastUpdated: Date.now()
      },
      { new: true }
    );
    
    return {
      workloadAnalysis: workloadResult,
      riskAnalysis: riskResult,
      recommendation: recommendationsResult, // Match field name with DB
      predictedDeadline: predictedDate
    };
  } catch (error) {
    console.error('AI Analysis Error:', error);
    throw error;
  }
};

export const generateAnalysis = async (req, res) => {
  try {
    const { projectId } = req.params;
    const project = await Project.findById(projectId);

    if (!project) {
      return res.status(404).json({ 
        success: false,
        message: 'Project not found'
      });
    }

    // Mark that insight generation was requested
    await Project.findByIdAndUpdate(
      projectId,
      {
        aiInsightsRequested: true,
        'aiInsights.processingStarted': new Date()
      }
    );

    // Generate insights and update the project
    let analysisResult;
    try {
      analysisResult = await generateProjectAnalysis(projectId);
      
      // Clear the requested flag & set lastGenerated
      await Project.findByIdAndUpdate(
        projectId,
        {
          aiInsightsRequested: false,
          'aiInsights.lastGenerated': new Date()
        }
      );

      // Get a fresh, fully populated project
      const updatedProj = await Project.findById(projectId)
        .populate({
          path: 'members.userId',
          model: 'User',
          select: 'username email profilePicture'
        })
        .populate({
          path: 'tasks',
          model: 'Task',
          populate: {
            path: 'assignedTo',
            model: 'User',
            select: 'username'
          }
        });

      // Return the updated project with fresh insights
      return res.status(200).json({
        success: true,
        message: 'AI analysis generation completed',
        analysis: analysisResult,
        project: updatedProj
      });
    } catch (analysisError) {
      console.error('Analysis generation failed:', analysisError);
      // Mark as failed so frontend knows
      await Project.findByIdAndUpdate(
        projectId,
        {
          aiInsightsRequested: false,
          'aiInsights.error': analysisError.message
        }
      );
      return res.status(500).json({
        success: false,
        message: 'AI analysis generation failed',
        error: analysisError.message
      });
    }
  } catch (error) {
    console.error('Generate AI Analysis Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to generate AI analysis',
      error: error.message
    });
  }
};




