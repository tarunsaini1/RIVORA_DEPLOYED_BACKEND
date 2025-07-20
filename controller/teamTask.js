import Team from '../models/Team.js';
import TeamTask from '../models/TeamTask.js';
import mongoose from 'mongoose';

// Get all tasks for a team
export const getTeamTasks = async (req, res) => {
  try {
    const { teamId } = req.params;
    const { status, priority, category, assignee, parent } = req.query;
    
    // Validate team access
    const team = await Team.findById(teamId);
    if (!team) {
      return res.status(404).json({ message: 'Team not found' });
    }
    
    // Check if user is a member of the team
    const isMember = team.members.some(member => 
      member.user.toString() === req.user._id.toString()
    ) || team.owner.toString() === req.user._id.toString();
    
    if (!isMember) {
      return res.status(403).json({ message: 'You are not a member of this team' });
    }
    
    // Build query
    const query = { team: teamId };
    
    // Apply filters if provided
    if (status) query.status = status;
    if (priority) query.priority = priority;
    if (category) query.category = category;
    if (parent) query.parent = parent || null; // null for top-level tasks
    
    if (assignee) {
      if (assignee === 'me') {
        // Tasks assigned to the current user
        query['assignees.user'] = req.user._id;
      } else {
        // Tasks assigned to a specific user
        query['assignees.user'] = assignee;
      }
    }
    
    // Fetch tasks
    const tasks = await TeamTask.find(query)
      .populate('createdBy', 'name email avatar')
      .populate('completedBy', 'name email avatar')
      .populate('assignees.user', 'name email avatar')
      .populate({
        path: 'attachments.fileId',
        select: 'name type size url'
      })
      .populate({
        path: 'comments.user',
        select: 'name email avatar'
      })
      .sort({ createdAt: -1 });
    
    res.status(200).json(tasks);
  } catch (error) {
    console.error('Error fetching team tasks:', error);
    res.status(500).json({ message: 'Failed to fetch team tasks', error: error.message });
  }
};

// Create a new task
export const createTeamTask = async (req, res) => {
  try {
    const { teamId } = req.params;
    const { 
      title, description, status, priority, category, 
      dueDate, assigneeIds, parent, estimatedHours 
    } = req.body;
    
    // Validate team access
    const team = await Team.findById(teamId);
    if (!team) {
      return res.status(404).json({ message: 'Team not found' });
    }
    
    // Check if user is a member of the team
    const isMember = team.members.some(member => 
      member.user.toString() === req.user._id.toString()
    ) || team.owner.toString() === req.user._id.toString();
    
    if (!isMember) {
      return res.status(403).json({ message: 'You are not a member of this team' });
    }
    
    // Create assignee array
    const assignees = [];
    if (assigneeIds && assigneeIds.length) {
      for (const userId of assigneeIds) {
        // Check if user is in the team
        const isTeamMember = team.members.some(member => 
          member.user.toString() === userId
        ) || team.owner.toString() === userId;
        
        if (isTeamMember) {
          assignees.push({
            user: userId,
            assignedAt: new Date()
          });
        }
      }
    }
    
    // If it's a subtask, verify the parent exists and belongs to the same team
    if (parent) {
      const parentTask = await TeamTask.findById(parent);
      if (!parentTask || parentTask.team.toString() !== teamId) {
        return res.status(400).json({ message: 'Invalid parent task' });
      }
    }
    
    // Create task
    const newTask = new TeamTask({
      team: teamId,
      title,
      description,
      status: status || 'todo',
      priority: priority || 'medium',
      category,
      dueDate,
      assignees,
      parent,
      estimatedHours,
      createdBy: req.user._id
    });
    
    await newTask.save();
    
    // Populate details
    await newTask.populate('createdBy', 'name email avatar');
    await newTask.populate('assignees.user', 'name email avatar');
    
    res.status(201).json(newTask);
  } catch (error) {
    console.error('Error creating team task:', error);
    res.status(500).json({ message: 'Failed to create team task', error: error.message });
  }
};

// Update a task
export const updateTeamTask = async (req, res) => {
  try {
    const { taskId } = req.params;
    const updateData = req.body;
    
    // Find the task
    const task = await TeamTask.findById(taskId);
    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }
    
    // Check permissions
    const team = await Team.findById(task.team);
    if (!team) {
      return res.status(404).json({ message: 'Team not found' });
    }
    
    // Check if user can edit this task (team owner, task creator, or assignee)
    const canEdit = 
      team.owner.toString() === req.user._id.toString() ||
      task.createdBy.toString() === req.user._id.toString() ||
      task.assignees.some(assignee => assignee.user.toString() === req.user._id.toString());
    
    if (!canEdit) {
      return res.status(403).json({ message: 'You do not have permission to update this task' });
    }
    
    // Handle status change to 'done'
    if (updateData.status === 'done' && task.status !== 'done') {
      updateData.completedAt = new Date();
      updateData.completedBy = req.user._id;
    }
    
    // Handle status change from 'done'
    if (updateData.status && updateData.status !== 'done' && task.status === 'done') {
      updateData.completedAt = null;
      updateData.completedBy = null;
    }
    
    // Handle assignee updates
    if (updateData.assigneeIds) {
      const assignees = [];
      
      for (const userId of updateData.assigneeIds) {
        // Check if user is in the team
        const isTeamMember = team.members.some(member => 
          member.user.toString() === userId
        ) || team.owner.toString() === userId;
        
        if (isTeamMember) {
          // Preserve assignment date if user was already assigned
          const existingAssignee = task.assignees.find(a => 
            a.user.toString() === userId
          );
          
          assignees.push({
            user: userId,
            assignedAt: existingAssignee ? existingAssignee.assignedAt : new Date()
          });
        }
      }
      
      updateData.assignees = assignees;
      delete updateData.assigneeIds;
    }
    
    // Update the task
    updateData.updatedBy = req.user._id;
    
    const updatedTask = await TeamTask.findByIdAndUpdate(
      taskId,
      updateData,
      { new: true }
    )
    .populate('createdBy', 'name email avatar')
    .populate('completedBy', 'name email avatar')
    .populate('assignees.user', 'name email avatar')
    .populate('updatedBy', 'name email avatar');
    
    res.status(200).json(updatedTask);
  } catch (error) {
    console.error('Error updating team task:', error);
    res.status(500).json({ message: 'Failed to update team task', error: error.message });
  }
};

// Delete a task
export const deleteTeamTask = async (req, res) => {
  try {
    const { taskId } = req.params;
    
    // Find the task
    const task = await TeamTask.findById(taskId);
    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }
    
    // Check permissions
    const team = await Team.findById(task.team);
    if (!team) {
      return res.status(404).json({ message: 'Team not found' });
    }
    
    // Only task creator or team owner can delete the task
    const canDelete = 
      task.createdBy.toString() === req.user._id.toString() || 
      team.owner.toString() === req.user._id.toString();
    
    if (!canDelete) {
      return res.status(403).json({ message: 'You do not have permission to delete this task' });
    }
    
    // Check for subtasks
    const subtasks = await TeamTask.find({ parent: taskId });
    if (subtasks.length > 0) {
      // Also delete all subtasks
      await TeamTask.deleteMany({ parent: taskId });
    }
    
    // Delete the task
    await TeamTask.findByIdAndDelete(taskId);
    
    res.status(200).json({ message: 'Task deleted successfully' });
  } catch (error) {
    console.error('Error deleting team task:', error);
    res.status(500).json({ message: 'Failed to delete team task', error: error.message });
  }
};

// Add comment to a task
export const addTaskComment = async (req, res) => {
  try {
    const { taskId } = req.params;
    const { text } = req.body;
    
    if (!text || !text.trim()) {
      return res.status(400).json({ message: 'Comment text is required' });
    }
    
    // Find the task
    const task = await TeamTask.findById(taskId);
    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }
    
    // Check if user is a team member
    const team = await Team.findById(task.team);
    if (!team) {
      return res.status(404).json({ message: 'Team not found' });
    }
    
    const isMember = team.members.some(member => 
      member.user.toString() === req.user._id.toString()
    ) || team.owner.toString() === req.user._id.toString();
    
    if (!isMember) {
      return res.status(403).json({ message: 'You are not a member of this team' });
    }
    
    // Add comment
    const newComment = {
      user: req.user._id,
      text,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    task.comments.push(newComment);
    await task.save();
    
    // Get the updated task with populated comment data
    const updatedTask = await TeamTask.findById(taskId)
      .populate('comments.user', 'name email avatar');
    
    const addedComment = updatedTask.comments[updatedTask.comments.length - 1];
    
    res.status(201).json(addedComment);
  } catch (error) {
    console.error('Error adding task comment:', error);
    res.status(500).json({ message: 'Failed to add comment', error: error.message });
  }
};

// Log time for a task
export const logTaskTime = async (req, res) => {
  try {
    const { taskId } = req.params;
    const { hours, description, date } = req.body;
    
    if (!hours || isNaN(hours) || hours <= 0) {
      return res.status(400).json({ message: 'Valid hours value is required' });
    }
    
    // Find the task
    const task = await TeamTask.findById(taskId);
    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }
    
    // Check if user is a team member
    const team = await Team.findById(task.team);
    if (!team) {
      return res.status(404).json({ message: 'Team not found' });
    }
    
    const isMember = team.members.some(member => 
      member.user.toString() === req.user._id.toString()
    ) || team.owner.toString() === req.user._id.toString();
    
    if (!isMember) {
      return res.status(403).json({ message: 'You are not a member of this team' });
    }
    
    // Add time log entry
    const timeLog = {
      user: req.user._id,
      hours: parseFloat(hours),
      description: description || '',
      date: date ? new Date(date) : new Date(),
      createdAt: new Date()
    };
    
    task.timeTracking.push(timeLog);
    
    // Update total hours logged
    task.totalHoursLogged = (task.totalHoursLogged || 0) + parseFloat(hours);
    
    await task.save();
    
    // Get the updated task with populated time log data
    const updatedTask = await TeamTask.findById(taskId)
      .populate('timeTracking.user', 'name email avatar');
    
    const addedTimeLog = updatedTask.timeTracking[updatedTask.timeTracking.length - 1];
    
    res.status(201).json({
      timeLog: addedTimeLog,
      totalHoursLogged: updatedTask.totalHoursLogged
    });
  } catch (error) {
    console.error('Error logging task time:', error);
    res.status(500).json({ message: 'Failed to log time', error: error.message });
  }
};

// Get time logs for a task
export const getTaskTimeLogs = async (req, res) => {
  try {
    const { taskId } = req.params;
    
    // Find the task
    const task = await TeamTask.findById(taskId)
      .populate('timeTracking.user', 'name email avatar');
    
    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }
    
    // Check if user is a team member
    const team = await Team.findById(task.team);
    if (!team) {
      return res.status(404).json({ message: 'Team not found' });
    }
    
    const isMember = team.members.some(member => 
      member.user.toString() === req.user._id.toString()
    ) || team.owner.toString() === req.user._id.toString();
    
    if (!isMember) {
      return res.status(403).json({ message: 'You are not a member of this team' });
    }
    
    res.status(200).json({
      timeLogs: task.timeTracking || [],
      totalHoursLogged: task.totalHoursLogged || 0
    });
  } catch (error) {
    console.error('Error getting task time logs:', error);
    res.status(500).json({ message: 'Failed to get time logs', error: error.message });
  }
};