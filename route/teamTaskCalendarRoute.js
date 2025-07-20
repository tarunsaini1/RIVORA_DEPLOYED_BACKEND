import express from 'express';
import mongoose from 'mongoose';
import authMiddlewareHybrid from '../authmiddleware/authMiddleware.js';
import * as teamTaskController from '../controller/teamTask.js';

// Import models
import Team from '../models/Team.js';
import TeamTask from '../models/TeamTask.js';
import User from '../models/User.js';
import TeamEvent from '../models/Calendar.js';

// Import calendar controller functions
import {
  getTeamEvents,
  createTeamEvent,
  updateTeamEvent,
  deleteTeamEvent,
  updateAttendeeStatus
} from '../controller/CalendarTask.js';

const router = express.Router();

// ===== TEAM TASKS ROUTES =====
// Get all tasks for a team
router.get('/teams/:teamId/tasks', authMiddlewareHybrid, teamTaskController.getTeamTasks);

// Create a new task
router.post('/teams/:teamId/tasks', authMiddlewareHybrid, teamTaskController.createTeamTask);

// Get specific task
router.get('/tasks/:taskId', authMiddlewareHybrid, async (req, res) => {
  try {
    const { taskId } = req.params;
    
    // Find the task with populated fields
    const task = await TeamTask.findById(taskId)
      .populate('assignees.user', 'name email avatar')
      .populate('createdBy', 'name email avatar')
      .populate('updatedBy', 'name email avatar')
      .populate('completedBy', 'name email avatar')
      .populate('parent', 'title status')
      .populate('comments.user', 'name email avatar')
      .populate('timeTracking.user', 'name email avatar')
      .populate('attachments.fileId')
      .populate('attachments.addedBy', 'name email avatar');
    
    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }
    
    // Check if user has access to this team
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
    
    res.status(200).json(task);
  } catch (error) {
    console.error('Error getting task details:', error);
    res.status(500).json({ message: 'Failed to get task details', error: error.message });
  }
});

// Update a task
router.put('/tasks/:taskId', authMiddlewareHybrid, teamTaskController.updateTeamTask);

// Delete a task
router.delete('/tasks/:taskId', authMiddlewareHybrid, teamTaskController.deleteTeamTask);

// Add comment to a task
router.post('/tasks/:taskId/comments', authMiddlewareHybrid, teamTaskController.addTaskComment);

// Log time for a task
router.post('/tasks/:taskId/time', authMiddlewareHybrid, teamTaskController.logTaskTime);

// Get time logs for a task
router.get('/tasks/:taskId/time', authMiddlewareHybrid, teamTaskController.getTaskTimeLogs);

// Task Analytics
router.get('/teams/:teamId/task-analytics', authMiddlewareHybrid, async (req, res) => {
  try {
    const { teamId } = req.params;
    
    // Validate team access
    const team = await Team.findById(teamId);
    if (!team) {
      return res.status(404).json({ message: 'Team not found' });
    }
    
    // Check if user is a member
    const isMember = team.members.some(member => 
      member.user.toString() === req.user._id.toString()
    ) || team.owner.toString() === req.user._id.toString();
    
    if (!isMember) {
      return res.status(403).json({ message: 'You are not a member of this team' });
    }
    
    // Status counts
    const statusCounts = await TeamTask.aggregate([
      { $match: { team: mongoose.Types.ObjectId(teamId) } },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);
    
    // Priority counts
    const priorityCounts = await TeamTask.aggregate([
      { $match: { team: mongoose.Types.ObjectId(teamId) } },
      { $group: { _id: '$priority', count: { $sum: 1 } } }
    ]);
    
    // Tasks by assignee
    const tasksByAssignee = await TeamTask.aggregate([
      { $match: { team: mongoose.Types.ObjectId(teamId) } },
      { $unwind: '$assignees' },
      { $group: { 
        _id: '$assignees.user', 
        taskCount: { $sum: 1 },
        completedCount: { 
          $sum: {
            $cond: [{ $eq: ['$status', 'done'] }, 1, 0]
          }
        }
      } }
    ]);
    
    // Populate user details
    const populatedAssignees = [];
    for (const item of tasksByAssignee) {
      const user = await User.findById(item._id).select('name email avatar');
      if (user) {
        populatedAssignees.push({
          user,
          taskCount: item.taskCount,
          completedCount: item.completedCount
        });
      }
    }
    
    // Time tracking stats
    const timeTrackingStats = await TeamTask.aggregate([
      { $match: { team: mongoose.Types.ObjectId(teamId) } },
      { $group: { 
        _id: null,
        totalHoursLogged: { $sum: '$totalHoursLogged' },
        tasksWithTimeTracking: { 
          $sum: {
            $cond: [{ $gt: ['$totalHoursLogged', 0] }, 1, 0]
          }
        }
      } }
    ]);
    
    const analytics = {
      statusCounts: statusCounts.map(item => ({ status: item._id, count: item.count })),
      priorityCounts: priorityCounts.map(item => ({ priority: item._id, count: item.count })),
      assignees: populatedAssignees,
      timeTracking: timeTrackingStats[0] || { totalHoursLogged: 0, tasksWithTimeTracking: 0 }
    };
    
    res.status(200).json(analytics);
  } catch (error) {
    console.error('Error getting task analytics:', error);
    res.status(500).json({ message: 'Failed to get task analytics', error: error.message });
  }
});

// ===== TEAM CALENDAR ROUTES =====
// Get team calendar events
router.get('/teams/:teamId/calendar', authMiddlewareHybrid, getTeamEvents);

// Create a new calendar event
router.post('/teams/:teamId/calendar', authMiddlewareHybrid, createTeamEvent);

// Get a specific calendar event
router.get('/calendar/:eventId', authMiddlewareHybrid, async (req, res) => {
   console.log("hello")
  try {
    const { eventId } = req.params;
    
    // Find the event with populated fields
    const event = await TeamEvent.findById(eventId)
      .populate('createdBy', 'name email avatar')
      .populate('updatedBy', 'name email avatar')
      .populate('attendees.user', 'name email avatar')
      .populate({
        path: 'relatedTask',
        select: 'title status priority dueDate',
        populate: {
          path: 'assignees.user',
          select: 'name avatar'
        }
      });
    
    if (!event) {
      return res.status(404).json({ message: 'Event not found' });
    }
    
    // Check if user has access
    const team = await Team.findById(event.team);
    if (!team) {
      return res.status(404).json({ message: 'Team not found' });
    }
    
    const isMember = team.members.some(member => 
      member.user.toString() === req.user._id.toString()
    ) || team.owner.toString() === req.user._id.toString();
    
    if (!isMember) {
      return res.status(403).json({ message: 'You are not a member of this team' });
    }
    
    res.status(200).json(event);
  } catch (error) {
    console.error('Error getting event details:', error);
    res.status(500).json({ message: 'Failed to get event details', error: error.message });
  }
});

// Update a calendar event
router.put('/calendar/:eventId', authMiddlewareHybrid, updateTeamEvent);

// Delete a calendar event
router.delete('/calendar/:eventId', authMiddlewareHybrid, deleteTeamEvent);

// Update attendee status
router.patch('/calendar/:eventId/attendance', authMiddlewareHybrid, updateAttendeeStatus);

// Link task to calendar event
router.post('/calendar/:eventId/link-task/:taskId', authMiddlewareHybrid, async (req, res) => {
  try {
    const { eventId, taskId } = req.params;
    
    // Find event and task
    const event = await TeamEvent.findById(eventId);
    const task = await TeamTask.findById(taskId);
    
    if (!event || !task) {
      return res.status(404).json({ 
        message: !event ? 'Event not found' : 'Task not found' 
      });
    }
    
    // Check if they belong to the same team
    if (event.team.toString() !== task.team.toString()) {
      return res.status(400).json({ message: 'Event and task must belong to the same team' });
    }
    
    // Check permissions
    const team = await Team.findById(event.team);
    if (!team) {
      return res.status(404).json({ message: 'Team not found' });
    }
    
    const canEdit = 
      event.createdBy.toString() === req.user._id.toString() || 
      team.owner.toString() === req.user._id.toString();
    
    if (!canEdit) {
      return res.status(403).json({ message: 'You do not have permission to update this event' });
    }
    
    // Link task to event
    event.relatedTask = taskId;
    await event.save();
    
    // Populate details for response
    await event.populate('createdBy', 'name email avatar');
    await event.populate('attendees.user', 'name email avatar');
    await event.populate({
      path: 'relatedTask',
      select: 'title status priority dueDate',
      populate: {
        path: 'assignees.user',
        select: 'name avatar'
      }
    });
    
    res.status(200).json(event);
  } catch (error) {
    console.error('Error linking task to event:', error);
    res.status(500).json({ message: 'Failed to link task to event', error: error.message });
  }
});

// Unlink task from calendar event
router.delete('/calendar/:eventId/link-task', authMiddlewareHybrid, async (req, res) => {
  try {
    const { eventId } = req.params;
    
    // Find event
    const event = await TeamEvent.findById(eventId);
    if (!event) {
      return res.status(404).json({ message: 'Event not found' });
    }
    
    // Check permissions
    const team = await Team.findById(event.team);
    if (!team) {
      return res.status(404).json({ message: 'Team not found' });
    }
    
    const canEdit = 
      event.createdBy.toString() === req.user._id.toString() || 
      team.owner.toString() === req.user._id.toString();
    
    if (!canEdit) {
      return res.status(403).json({ message: 'You do not have permission to update this event' });
    }
    
    // Unlink task
    event.relatedTask = null;
    await event.save();
    
    // Populate details for response
    await event.populate('createdBy', 'name email avatar');
    await event.populate('attendees.user', 'name email avatar');
    
    res.status(200).json(event);
  } catch (error) {
    console.error('Error unlinking task from event:', error);
    res.status(500).json({ message: 'Failed to unlink task', error: error.message });
  }
});

// Calendar Analytics
router.get('/teams/:teamId/calendar-analytics', authMiddlewareHybrid, async (req, res) => {
  try {
    const { teamId } = req.params;
    const { period } = req.query;
    
    // Validate team access
    const team = await Team.findById(teamId);
    if (!team) {
      return res.status(404).json({ message: 'Team not found' });
    }
    
    // Check if user is a member
    const isMember = team.members.some(member => 
      member.user.toString() === req.user._id.toString()
    ) || team.owner.toString() === req.user._id.toString();
    
    if (!isMember) {
      return res.status(403).json({ message: 'You are not a member of this team' });
    }
    
    // Determine date range
    const now = new Date();
    let startDate, endDate;
    
    switch (period) {
      case 'week':
        startDate = new Date(now);
        startDate.setDate(now.getDate() - now.getDay()); // Start of week (Sunday)
        startDate.setHours(0, 0, 0, 0);
        
        endDate = new Date(startDate);
        endDate.setDate(startDate.getDate() + 7); // End of week
        break;
        
      case 'month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1); // Start of month
        endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0); // End of month
        endDate.setHours(23, 59, 59, 999);
        break;
        
      case 'quarter':
        const quarter = Math.floor(now.getMonth() / 3);
        startDate = new Date(now.getFullYear(), quarter * 3, 1); // Start of quarter
        endDate = new Date(now.getFullYear(), (quarter + 1) * 3, 0); // End of quarter
        endDate.setHours(23, 59, 59, 999);
        break;
        
      default: // Return last 30 days if no valid period specified
        startDate = new Date(now);
        startDate.setDate(now.getDate() - 30);
        startDate.setHours(0, 0, 0, 0);
        endDate = now;
    }
    
    // Event count by date
    const eventsByDate = await TeamEvent.aggregate([
      { 
        $match: { 
          team: mongoose.Types.ObjectId(teamId),
          startDate: { $gte: startDate, $lte: endDate }
        } 
      },
      {
        $group: {
          _id: { 
            $dateToString: { format: '%Y-%m-%d', date: '$startDate' } 
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);
    
    // Event count by creator
    const eventsByCreator = await TeamEvent.aggregate([
      { 
        $match: { 
          team: mongoose.Types.ObjectId(teamId),
          startDate: { $gte: startDate, $lte: endDate }
        } 
      },
      { $group: { _id: '$createdBy', count: { $sum: 1 } } }
    ]);
    
    // Populate creator details
    const populatedCreators = [];
    for (const item of eventsByCreator) {
      const user = await User.findById(item._id).select('name email avatar');
      if (user) {
        populatedCreators.push({
          user,
          eventCount: item.count
        });
      }
    }
    
    // Attendance stats
    const attendanceStats = await TeamEvent.aggregate([
      { 
        $match: { 
          team: mongoose.Types.ObjectId(teamId),
          startDate: { $gte: startDate, $lte: endDate }
        } 
      },
      { $unwind: '$attendees' },
      { 
        $group: { 
          _id: '$attendees.status', 
          count: { $sum: 1 } 
        } 
      }
    ]);
    
    const analytics = {
      period: {
        start: startDate,
        end: endDate
      },
      eventCount: eventsByDate.reduce((sum, item) => sum + item.count, 0),
      eventsByDate,
      eventsByCreator: populatedCreators,
      attendance: attendanceStats.map(item => ({ 
        status: item._id, 
        count: item.count 
      }))
    };
    
    res.status(200).json(analytics);
  } catch (error) {
    console.error('Error getting calendar analytics:', error);
    res.status(500).json({ message: 'Failed to get calendar analytics', error: error.message });
  }
});

export default router;