import { Task } from '../models/TaskModel.js';
import User from '../models/User.js';
import Project from '../models/Project.js';
import PerformanceReport from '../models/performanceModel.js';
import { getGeminiAnalysis } from '../utils/ai.js';

// Get user performance report
export const getUserPerformanceReport = async (req, res) => {
  console.log('Getting user performance report');
  console.log('req.query:', req.query);
  try {
    const { userId, projectId } = req.query;
    console.log('userId:', userId);
    
    if (!userId || !projectId) {
      return res.status(400).json({ message: 'User ID and Project ID are required' });
    }

    // Check if a recent report exists using ES6 features
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const existingReport = await PerformanceReport.findOne({
      userId,
      projectId,
      generatedAt: { $gte: oneDayAgo }
    }).sort({ generatedAt: -1 });

    if (existingReport) {
      console.log('Found existing report:', existingReport._id);
      return res.json(existingReport);
    }

    // If no recent report, return "not found" to prompt frontend to generate one
    console.log('No recent report found, returning 404');
    return res.status(404).json({ message: 'No recent performance report found' });
  } catch (error) {
    console.error('Error fetching performance report:', error);
    return res.status(500).json({ message: 'Failed to fetch performance report', error: error.message });
  }
};

// Generate a new performance report using AI with ES6 syntax
export const generatePerformanceReport = async (req, res) => {
  console.log('Generating performance report');
  console.log('req.body:', req.body);
  
  try {
    const { userId, projectId } = req.body;
    
    if (!userId || !projectId) {
      return res.status(400).json({ message: 'User ID and Project ID are required' });
    }

    // Get user and project data with Promise.all for parallel requests
    const [user, project] = await Promise.all([
      User.findById(userId),
      Project.findById(projectId)
    ]);

    // Check if user exists
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Check if project exists
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    console.log(`Generating report for user: ${user.username} in project: ${project.name}`);

    // Get all tasks for this user in this project
    const tasks = await Task.find({
      projectId,
      assignedTo: userId
    }).populate('subtasks');

    console.log(`Found ${tasks.length} tasks for this user`);

    // Use ES6 array methods for calculations
    const totalTasks = tasks.length;
    
    // Task status counts using filter
    const completedTasks = tasks.filter(task => task.status === 'completed').length;
    const inProgressTasks = tasks.filter(task => task.status === 'in_progress').length;
    const todoTasks = tasks.filter(task => task.status === 'todo').length;
    const reviewTasks = tasks.filter(task => task.status === 'in_review').length;

    // Calculate completion rate with default via ES6 features
    const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    // Calculate average progress with ES6 arrow functions and optional chaining
    const tasksWithProgress = tasks.filter(task => typeof task.progress === 'number');
    
    const avgProgress = tasksWithProgress.length > 0
      ? Math.round(tasksWithProgress.reduce((sum, task) => sum + task.progress, 0) / tasksWithProgress.length)
      : 0;

    // Calculate deadline metrics with ES6 arrow functions
    const currentDate = new Date();
    
    const overdueCount = tasks.filter(task => 
      task.dueDate && new Date(task.dueDate) < currentDate && task.status !== 'completed'
    ).length;

    const onTimeCompletions = tasks.filter(task => 
      task.status === 'completed' && 
      task.dueDate && 
      new Date(task.completedAt || task.updatedAt) <= new Date(task.dueDate)
    ).length;

    // Prepare data for AI analysis with ES6 object shorthand and arrow functions
    const userData = {
      username: user.username,
      totalTasks,
      completedTasks,
      inProgressTasks,
      todoTasks,
      reviewTasks,
      completionRate,
      avgProgress,
      overdueCount,
      onTimeCompletions,
      project: {
        name: project.name,
        description: project.description
      },
      taskDetails: tasks.map(task => ({
        title: task.title,
        description: task.description,
        status: task.status,
        priority: task.priority,
        progress: task.progress,
        dueDate: task.dueDate,
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
        completedAt: task.completedAt,
        subtasks: task.subtasks?.map(sub => ({
          title: sub.title,
          completed: sub.completed
        }))
      }))
    };

    console.log('Calling Gemini API for analysis...');
    
    // Get AI analysis from Gemini
    let aiAnalysis;
    try {
      aiAnalysis = await getGeminiAnalysis(userData);
      console.log('Received AI analysis successfully');
    } catch (aiError) {
      console.error('Error getting AI analysis:', aiError);
      console.log('Using default analysis instead');
      aiAnalysis = null;
    }

    // Build the performance report with object spread
    const defaultAnalysis = {
      performanceScore: Math.min(Math.round((completionRate + avgProgress) / 2), 100),
      productivity: Math.round((completionRate + avgProgress) / 20), // Scale to 0-10
      responseTime: 'Average',
      strengths: ['Completing assigned tasks'],
      improvements: ['Time management could be improved'],
      insights: 'User is performing at an average level.',
      recommendations: [
        'Set clear daily goals for task completion',
        'Focus on high-priority tasks first',
        'Break down complex tasks into smaller subtasks'
      ]
    };

    // Use object spread to handle potentially missing AI analysis fields
    const analysis = aiAnalysis ? { ...defaultAnalysis, ...aiAnalysis } : defaultAnalysis;
    
    // Debug the analysis data
    console.log('Final analysis data:', {
      performanceScore: analysis.performanceScore,
      productivity: analysis.productivity,
      responseTime: analysis.responseTime,
      // other fields omitted for brevity
    });

    const performanceReport = new PerformanceReport({
      userId,
      projectId,
      username: user.username,
      projectName: project.name,
      generatedAt: new Date(),
      performanceScore: analysis.performanceScore,
      metrics: {
        completionRate,
        avgProgress,
        overdueCount,
        onTimeCompletions,
        productivity: analysis.productivity,
        responseTime: analysis.responseTime
      },
      analysis: {
        strengths: analysis.strengths,
        improvements: analysis.improvements,
        insights: analysis.insights
      },
      recommendations: analysis.recommendations
    });

    console.log('Saving performance report to database...');
    const savedReport = await performanceReport.save();
    console.log('Report saved successfully with ID:', savedReport._id);
    
    return res.status(201).json(savedReport);
  } catch (error) {
    console.error('Error generating performance report:', error);
    return res.status(500).json({ message: 'Failed to generate performance report', error: error.message });
  }
};