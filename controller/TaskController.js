import { Task } from "../models/TaskModel.js";
import User from "../models/User.js";
import Project from "../models/Project.js";
import notificationService from '../Service/notificationService.js'; // Import notification service

// Create a new task
export const createTask = async (req, res) => {
    try {
        // Ensure required fields are set from the authenticated user if not provided
        const data = { ...req.body };
        if (!data.createdBy) {
            if (req.user && req.user._id) {
                data.createdBy = req.user._id;
            } else {
                return res.status(400).json({ message: "createdBy is required" });
            }
        }
        if (!data.assignedBy) {
            if (req.user && req.user._id) {
                data.assignedBy = req.user._id;
            } else {
                return res.status(400).json({ message: "assignedBy is required" });
            }
        }

        const task = new Task(data);
        await task.save();
        await updateProjectProgress(task.projectId);
        
        // Get project name for notifications
        const project = await Project.findById(task.projectId).select('name');
        if (!project) {
            console.log("Project not found for notification");
            return res.status(201).json(task);
        }
        
        // Get creator info
        const creator = await User.findById(data.createdBy).select('name username');
        
        // Send notifications to assigned users
        if (task.assignedTo && task.assignedTo.length > 0) {
            // Create different notification for each assigned user
            const notificationPromises = task.assignedTo.map(userId => {
                // Don't send notification if assigned to self
                if (userId.toString() === data.createdBy.toString()) {
                    return Promise.resolve();
                }
                
                return notificationService.createNotification({
                    recipientId: userId,
                    type: 'task_assigned',
                    title: 'New Task Assigned',
                    content: `${creator.name} assigned you to task "${task.title}" in project "${project.name}"`,
                    senderId: data.createdBy,
                    entityType: 'task',
                    entityId: task._id,
                    actionUrl: `/projects/${task.projectId}/tasks/${task._id}`,
                    priority: task.priority === 'high' ? 'high' : 'medium',
                    metaData: {
                        projectId: task.projectId,
                        projectName: project.name,
                        taskTitle: task.title,
                        taskPriority: task.priority,
                        taskDueDate: task.dueDate
                    }
                });
            });
            
            await Promise.all(notificationPromises);
        }
        
        res.status(201).json(task);
    } catch (error) {
        console.log(error);
        res.status(500).json({ error: error.message });
    }
};

// Get all tasks
export const getTasks = async (req, res) => {
    try {
        console.log('Fetching tasks:', req.query);
        const { projectId } = req.query;

        // If projectId is provided, filter tasks by project
        const query = projectId ? { projectId } : {};

        const tasks = await Task.find(query)
            .populate({
                path: 'assignedTo',
                select: 'username email profilePicture'
            })
            .populate({
                path: 'createdBy',
                select: 'username email profilePicture'
            })
            .sort({ createdAt: -1 }); // Sort by newest first

        console.log(`Found ${tasks.length} tasks`);

        res.status(200).json(tasks);
    } catch (error) {
        console.error('Error fetching tasks:', error);
        res.status(500).json({ error: error.message });
    }
};

// Get a task by ID
export const getTaskById = async (req, res) => {
    try {
        const task = await Task.findById(req.params.id);
        if (!task) return res.status(404).json({ message: "Task not found" });
        res.status(200).json(task);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// Update a task
export const updateTask = async (req, res) => {
    try {
        // Store original task to check for status change
        const originalTask = await Task.findById(req.params.id);
        if (!originalTask) return res.status(404).json({ message: "Task not found" });

        // Perform the update
        const task = await Task.findByIdAndUpdate(req.params.id, req.body, { new: true });
        
        // Check what fields were changed for targeted notifications
        const changedFields = [];
        if (req.body.title && req.body.title !== originalTask.title) changedFields.push('title');
        if (req.body.description && req.body.description !== originalTask.description) changedFields.push('description');
        if (req.body.dueDate && req.body.dueDate !== originalTask.dueDate) changedFields.push('dueDate');
        if (req.body.priority && req.body.priority !== originalTask.priority) changedFields.push('priority');
        
        // Check if status or progress changed
        const statusChanged = req.body.status && req.body.status !== originalTask.status;
        const progressChanged = req.body.progress !== undefined && req.body.progress !== originalTask.progress;
        
        if (statusChanged) changedFields.push('status');
        if (progressChanged) changedFields.push('progress');
        
        // If status or progress changed, update project progress
        if (statusChanged || progressChanged) {
            console.log(`Task ${task._id} ${statusChanged ? 'status changed to ' + task.status : ''}${progressChanged ? ' progress changed to ' + task.progress + '%' : ''}`);
            await updateProjectProgress(task.projectId);
        }
        
        // Only create notifications if important fields were changed
        if (changedFields.length > 0) {
            // Get project name for notifications
            const project = await Project.findById(task.projectId).select('name');
            
            // Get user who made the changes
            const updatedBy = req.user._id;
            const updater = await User.findById(updatedBy).select('name');
            
            // Prepare notification message based on what changed
            let notificationTitle = 'Task Updated';
            let notificationContent = `Task "${task.title}" has been updated by ${updater.name}`;
            
            // Create more specific notification content for certain changes
            if (changedFields.length === 1) {
                if (changedFields[0] === 'status') {
                    notificationTitle = 'Task Status Changed';
                    notificationContent = `Task "${task.title}" status changed to ${task.status} by ${updater.name}`;
                    
                    // Special notification for completed tasks
                    if (task.status === 'completed' || task.status === 'done') {
                        notificationTitle = 'Task Completed';
                        notificationContent = `Task "${task.title}" was marked as completed by ${updater.name}`;
                    }
                } 
                else if (changedFields[0] === 'priority') {
                    notificationTitle = 'Task Priority Changed';
                    notificationContent = `Task "${task.title}" priority changed to ${task.priority} by ${updater.name}`;
                }
                else if (changedFields[0] === 'dueDate') {
                    notificationTitle = 'Task Due Date Changed';
                    notificationContent = `Task "${task.title}" due date has been updated by ${updater.name}`;
                }
            }
            
            // Determine who should be notified
            const recipientsToNotify = [...new Set([
                ...task.assignedTo.map(id => id.toString()),
                originalTask.createdBy.toString()
            ])].filter(id => id !== updatedBy.toString());
            
            // Send notifications to all relevant users
            if (recipientsToNotify.length > 0) {
                const notificationPromises = recipientsToNotify.map(recipientId => 
                    notificationService.createNotification({
                        recipientId,
                        type: statusChanged ? 'task_status' : 'task_update',
                        title: notificationTitle,
                        content: notificationContent,
                        senderId: updatedBy,
                        entityType: 'task',
                        entityId: task._id,
                        actionUrl: `/projects/${task.projectId}/tasks/${task._id}`,
                        priority: task.status === 'completed' || task.priority === 'high' ? 'high' : 'medium',
                        metaData: {
                            projectId: task.projectId,
                            projectName: project?.name || 'Unknown Project',
                            taskTitle: task.title,
                            changedFields,
                            newStatus: statusChanged ? task.status : undefined,
                            newPriority: req.body.priority || undefined,
                            newProgress: progressChanged ? task.progress : undefined
                        }
                    })
                );
                
                await Promise.all(notificationPromises);
            }
        }
        
        res.status(200).json(task);
    } catch (error) {
        console.error('Error updating task:', error);
        res.status(500).json({ error: error.message });
    }
};

// Delete a task
export const deleteTask = async (req, res) => {
    try {
        const task = await Task.findById(req.params.id);
        if (!task) return res.status(404).json({ message: "Task not found" });
        
        const projectId = task.projectId; // Store projectId before deletion
        const taskTitle = task.title;
        const assignedUsers = [...task.assignedTo]; // Copy assignedUsers for notification
        
        // Delete the task
        await Task.findByIdAndDelete(req.params.id);

        // Remove task ID from assigned users
        await User.updateMany(
            { tasks: req.params.id },
            { $pull: { tasks: req.params.id } }
        );

        // Update project progress
        await updateProjectProgress(projectId);
        
        // Get project info for notification
        const project = await Project.findById(projectId).select('name');
        
        // Notify users that task was deleted
        if (assignedUsers.length > 0) {
            const deletedBy = req.user._id;
            const deleter = await User.findById(deletedBy).select('name');
            
            const notificationPromises = assignedUsers
                .filter(userId => userId.toString() !== deletedBy.toString()) // Don't notify the deleter
                .map(userId => 
                    notificationService.createNotification({
                        recipientId: userId,
                        type: 'task_update',
                        title: 'Task Deleted',
                        content: `Task "${taskTitle}" in project "${project?.name || 'Unknown'}" was deleted by ${deleter.name}`,
                        senderId: deletedBy,
                        entityType: 'project',
                        entityId: projectId,
                        actionUrl: `/projects/${projectId}`,
                        priority: 'medium',
                        metaData: {
                            projectId,
                            projectName: project?.name || 'Unknown',
                            taskTitle,
                            deletedAt: new Date()
                        }
                    })
                );
            
            await Promise.all(notificationPromises);
        }

        res.status(200).json({ message: "Task deleted successfully" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// Assign users to a task
export const assignUsers = async (req, res) => {
    try {
        const { userIds } = req.body;
        
        // Get original task to determine which users are newly assigned
        const originalTask = await Task.findById(req.params.id);
        if (!originalTask) return res.status(404).json({ message: "Task not found" });
        
        // Find which users are newly assigned
        const originalAssigned = originalTask.assignedTo.map(id => id.toString());
        const newlyAssigned = userIds.filter(id => !originalAssigned.includes(id.toString()));
        
        // Perform the update
        const task = await Task.findByIdAndUpdate(
            req.params.id,
            { $addToSet: { assignedTo: { $each: userIds } } },
            { new: true }
        ).populate('assignedTo');
        
        if (!task) return res.status(404).json({ message: "Task not found" });
        
        // If there are newly assigned users, send notifications
        if (newlyAssigned.length > 0) {
            // Get project name
            const project = await Project.findById(task.projectId).select('name');
            
            // Get assigner info
            const assignerId = req.user._id;
            const assigner = await User.findById(assignerId).select('name');
            
            // Create notifications for newly assigned users
            const notificationPromises = newlyAssigned
                .filter(userId => userId.toString() !== assignerId.toString()) // Don't notify self
                .map(userId => 
                    notificationService.createNotification({
                        recipientId: userId,
                        type: 'task_assigned',
                        title: 'New Task Assignment',
                        content: `${assigner.name} assigned you to task "${task.title}" in project "${project?.name || 'Unknown'}"`,
                        senderId: assignerId,
                        entityType: 'task',
                        entityId: task._id,
                        actionUrl: `/projects/${task.projectId}/tasks/${task._id}`,
                        priority: task.priority === 'high' ? 'high' : 'medium',
                        metaData: {
                            projectId: task.projectId,
                            projectName: project?.name || 'Unknown',
                            taskTitle: task.title,
                            taskDueDate: task.dueDate,
                            taskPriority: task.priority,
                        }
                    })
                );
            
            await Promise.all(notificationPromises);
        }
        
        res.status(200).json(task);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// Unassign a user from a task
export const unassignUser = async (req, res) => {
    try {
        const { userId } = req.body;
        
        // Get original task first
        const originalTask = await Task.findById(req.params.id);
        if (!originalTask) return res.status(404).json({ message: "Task not found" });
        
        // Update the task
        const task = await Task.findByIdAndUpdate(
            req.params.id,
            { $pull: { assignedTo: userId } },
            { new: true }
        ).populate('assignedTo');

        if (!task) return res.status(404).json({ message: "Task not found" });
        
        // Only notify if user was actually unassigned (they were on the assignedTo list before)
        const wasAssigned = originalTask.assignedTo.some(id => id.toString() === userId.toString());
        
        if (wasAssigned) {
            // Get project info
            const project = await Project.findById(task.projectId).select('name');
            
            // Get action performer
            const actionById = req.user._id;
            const actionBy = await User.findById(actionById).select('name');
            
            // Don't notify self
            if (userId !== actionById.toString()) {
                // Notify the unassigned user
                await notificationService.createNotification({
                    recipientId: userId,
                    type: 'task_update',
                    title: 'Removed from Task',
                    content: `${actionBy.name} has removed you from task "${task.title}" in project "${project?.name || 'Unknown'}"`,
                    senderId: actionById,
                    entityType: 'project',
                    entityId: task.projectId,
                    actionUrl: `/projects/${task.projectId}`,
                    priority: 'medium',
                    metaData: {
                        projectId: task.projectId,
                        projectName: project?.name || 'Unknown',
                        taskTitle: task.title,
                        unassignedAt: new Date()
                    }
                });
            }
        }
        
        res.status(200).json(task);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// Add a subtask
export const addSubtask = async (req, res) => {
    try {
        const task = await Task.findByIdAndUpdate(req.params.id, {
            $push: { subtasks: req.body.subtaskId },
        }, { new: true });

        if (!task) return res.status(404).json({ message: "Task not found" });
        
        // No notification needed for subtasks as they're just organizational
        
        res.status(200).json(task);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// Update progress of a task
export const updateProgress = async (req, res) => {
    try {
        const originalTask = await Task.findById(req.params.id);
        if (!originalTask) return res.status(404).json({ message: "Task not found" });
        
        const newProgress = req.body.progress;
        const oldProgress = originalTask.progress || 0;
        const progressDifference = Math.abs(newProgress - oldProgress);
        
        // Only notify on significant progress changes
        const shouldNotify = progressDifference >= 20; // 20% threshold
        
        const task = await Task.findByIdAndUpdate(req.params.id, {
            progress: newProgress,
        }, { new: true });

        if (!task) return res.status(404).json({ message: "Task not found" });
        
        // Update project progress
        await updateProjectProgress(task.projectId);
        
        // Send notifications for significant progress changes
        if (shouldNotify) {
            // Get project info
            const project = await Project.findById(task.projectId).select('name');
            
            // Get user who updated progress
            const updatedBy = req.user._id;
            const updater = await User.findById(updatedBy).select('name');
            
            // Generate appropriate message based on progress direction
            let notificationTitle = 'Task Progress Updated';
            let notificationContent = '';
            
            if (newProgress > oldProgress) {
                notificationContent = `${updater.name} updated task "${task.title}" progress to ${newProgress}%`;
                
                // Special message for completion
                if (newProgress === 100) {
                    notificationTitle = 'Task Completed';
                    notificationContent = `${updater.name} has marked task "${task.title}" as 100% complete`;
                }
            } else {
                notificationContent = `${updater.name} adjusted task "${task.title}" progress to ${newProgress}%`;
            }
            
            // Notify task creator and other assigned users
            const recipientsToNotify = [...new Set([
                originalTask.createdBy.toString(),
                ...task.assignedTo.map(id => id.toString())
            ])].filter(id => id !== updatedBy.toString()); // Don't notify self
            
            const notificationPromises = recipientsToNotify.map(recipientId =>
                notificationService.createNotification({
                    recipientId,
                    type: 'task_update',
                    title: notificationTitle,
                    content: notificationContent,
                    senderId: updatedBy,
                    entityType: 'task',
                    entityId: task._id,
                    actionUrl: `/projects/${task.projectId}/tasks/${task._id}`,
                    priority: newProgress === 100 ? 'high' : 'medium',
                    metaData: {
                        projectId: task.projectId,
                        projectName: project?.name || 'Unknown',
                        taskTitle: task.title,
                        oldProgress,
                        newProgress,
                        updatedAt: new Date()
                    }
                })
            );
            
            await Promise.all(notificationPromises);
        }
        
        res.status(200).json(task);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// Add a new endpoint to check for approaching deadlines and notify users
export const checkTaskDeadlines = async () => {
    try {
        const today = new Date();
        const tomorrow = new Date(today);
        tomorrow.setDate(today.getDate() + 1);
        
        const threeDaysFromNow = new Date(today);
        threeDaysFromNow.setDate(today.getDate() + 3);
        
        // Find all tasks with approaching deadlines that aren't completed
        const tasks = await Task.find({
            dueDate: { 
                $gte: today,
                $lte: threeDaysFromNow
            },
            status: { $nin: ['completed', 'done'] }
        }).populate('projectId', 'name').populate('assignedTo');
        
        console.log(`Found ${tasks.length} tasks with approaching deadlines`);
        
        let notificationCount = 0;
        
        // Process each task
        for (const task of tasks) {
            const daysUntilDue = Math.ceil((new Date(task.dueDate) - today) / (1000 * 60 * 60 * 24));
            let priority, title, content;
            
            // Create appropriate notification based on urgency
            if (daysUntilDue <= 1) {
                priority = 'high';
                title = 'Urgent: Task Due Tomorrow';
                content = `Task "${task.title}" in project "${task.projectId?.name || 'Unknown'}" is due ${daysUntilDue === 0 ? 'today' : 'tomorrow'}!`;
            } else {
                priority = 'medium';
                title = `Task Due in ${daysUntilDue} Days`;
                content = `Your task "${task.title}" in project "${task.projectId?.name || 'Unknown'}" is due in ${daysUntilDue} days`;
            }
            
            // Send notifications to all assigned users
            if (task.assignedTo && task.assignedTo.length > 0) {
                const notificationPromises = task.assignedTo.map(user => 
                    notificationService.createNotification({
                        recipientId: user._id,
                        type: 'task_deadline',
                        title,
                        content,
                        entityType: 'task',
                        entityId: task._id,
                        actionUrl: `/projects/${task.projectId?._id}/tasks/${task._id}`,
                        priority,
                        metaData: {
                            projectId: task.projectId?._id,
                            projectName: task.projectId?.name || 'Unknown',
                            taskTitle: task.title,
                            dueDate: task.dueDate,
                            daysRemaining: daysUntilDue
                        }
                    })
                );
                
                await Promise.all(notificationPromises);
                notificationCount += task.assignedTo.length;
            }
        }
        
        return {
            success: true,
            tasksProcessed: tasks.length,
            notificationsSent: notificationCount
        };
    } catch (error) {
        console.error('Error checking task deadlines:', error);
        return {
            success: false,
            error: error.message
        };
    }
};

// Improved helper function to update project progress based on task status and progress
const updateProjectProgress = async (projectId) => {
  try {
    console.log(`Updating progress for project: ${projectId}`);
    
    // Get all tasks for this project
    const tasks = await Task.find({ projectId: projectId });
    
    if (!tasks || tasks.length === 0) {
      console.log(`No tasks found for project ${projectId}`);
      return;
    }
    
    console.log(`Found ${tasks.length} tasks for project ${projectId}`);
    
    // Calculate progress using both task progress values and status
    let totalProgress = 0;
    
    tasks.forEach(task => {
      // If task is completed or done, count it as 100%
      if (task.status === 'completed' || task.status === 'done') {
        totalProgress += 100;
      } 
      // If task is in review, count it as at least 90%
      else if (task.status === 'in_review') {
        totalProgress += Math.max(90, task.progress || 0);
      }
      // If task is in progress, use its progress value but ensure minimum 10%
      else if (task.status === 'in_progress') {
        totalProgress += Math.max(10, task.progress || 0);
      }
      // If task is todo, count any progress value or 0
      else {
        totalProgress += task.progress || 0;
      }
    });
    
    // Calculate average progress (0-100)
    const progress = Math.round(totalProgress / tasks.length);
    
    console.log(`Calculated progress for project ${projectId}: ${progress}%`);
    
    // Update the project
    const updatedProject = await Project.findByIdAndUpdate(
      projectId,
      { 
        progress,
        lastUpdated: Date.now() 
      },
      { new: true }
    );
    
    if (!updatedProject) {
      console.log(`Project ${projectId} not found`);
    } else {
      console.log(`Successfully updated project ${projectId} progress to ${progress}%`);
      
      // Check for progress milestone notifications (25%, 50%, 75%, 100%)
      const milestones = [25, 50, 75, 100];
      const previousProgress = updatedProject.previousProgress || 0;
      
      // Save current progress for future comparison
      await Project.findByIdAndUpdate(
        projectId,
        { previousProgress: progress }
      );
      
      // Find the next milestone we've just passed
      const milestone = milestones.find(m => previousProgress < m && progress >= m);
      
      if (milestone) {
        // Notify project owner about milestone
        await notificationService.createNotification({
          recipientId: updatedProject.owner,
          type: 'project_update',
          title: `Project Milestone: ${milestone}% Complete`,
          content: `Your project "${updatedProject.name}" is now ${milestone}% complete!`,
          entityType: 'project',
          entityId: projectId,
          actionUrl: `/projects/${projectId}`,
          priority: milestone === 100 ? 'high' : 'medium',
          metaData: {
            projectName: updatedProject.name,
            milestone,
            previousProgress,
            currentProgress: progress,
            updatedAt: new Date()
          }
        });
      }
    }
    
    return progress;
  } catch (error) {
    console.error('Error updating project progress:', error);
  }
};