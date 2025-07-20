// Add this function to your UserController.js
import express from 'express';
import { Task } from '../models/TaskModel.js';

export const getUserTasks = async (req, res) => {
    console.log('Fetching user tasks...');
  try {
    const userId = req.user.id;
    
    // Find tasks where user is assigned
    const tasks = await Task.find({ 
      assignedTo: { $in: [userId] } 
    })
    .populate('projectId', 'name color')
    .populate('assignedBy', 'name username profilePicture')
    .populate('createdBy', 'name username profilePicture')
    .sort({ dueDate: 1, priority: -1 })
    .lean();
    
    return res.status(200).json({
      success: true,
      tasks
    });
  } catch (error) {
    console.error('Error fetching user tasks:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch tasks',
      error: error.message
    });
  }
};