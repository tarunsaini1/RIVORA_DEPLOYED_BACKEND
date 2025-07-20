import { Task } from "../models/TaskModel.js";
import User from "../models/User.js";
import Project from "../models/Project.js";

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
// export const updateTask = async (req, res) => {
//     try {
//         const task = await Task.findByIdAndUpdate(req.params.id, req.body, { new: true });
//         if (!task) return res.status(404).json({ message: "Task not found" });
//         res.status(200).json(task);
//     } catch (error) {
//         res.status(500).json({ error: error.message });
//         console.log(error);
//     }
// };

// Update a task
export const updateTask = async (req, res) => {
    try {
        // Store original task to check for status change
        const originalTask = await Task.findById(req.params.id);
        if (!originalTask) return res.status(404).json({ message: "Task not found" });

        // Perform the update
        const task = await Task.findByIdAndUpdate(req.params.id, req.body, { new: true });
        
        // Check if status or progress changed
        const statusChanged = req.body.status && req.body.status !== originalTask.status;
        const progressChanged = req.body.progress !== undefined && req.body.progress !== originalTask.progress;
        
        // If status or progress changed, update project progress
        if (statusChanged || progressChanged) {
            console.log(`Task ${task._id} ${statusChanged ? 'status changed to ' + task.status : ''}${progressChanged ? ' progress changed to ' + task.progress + '%' : ''}`);
            await updateProjectProgress(task.projectId);
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
        const task = await Task.findByIdAndDelete(req.params.id);
        if (!task) return res.status(404).json({ message: "Task not found" });

        // Remove task ID from assigned users
        await User.updateMany(
            { tasks: req.params.id },
            { $pull: { tasks: req.params.id } }
        );

         await updateProjectProgress(projectId);

        res.status(200).json({ message: "Task deleted successfully" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// Assign users to a task
export const assignUsers = async (req, res) => {
    try {
        const { userIds } = req.body;
        const task = await Task.findByIdAndUpdate(
            req.params.id,
            { $addToSet: { assignedTo: { $each: userIds } } },
            { new: true }
        ).populate('assignedTo');
        console.log(task);

        if (!task) return res.status(404).json({ message: "Task not found" });
        res.status(200).json(task);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// Unassign a user from a task
export const unassignUser = async (req, res) => {
    try {
        const { userId } = req.body;
        const task = await Task.findByIdAndUpdate(
            req.params.id,
            { $pull: { assignedTo: userId } },
            { new: true }
        ).populate('assignedTo');

        if (!task) return res.status(404).json({ message: "Task not found" });
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
        res.status(200).json(task);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// Update progress of a task
export const updateProgress = async (req, res) => {
    try {
        const task = await Task.findByIdAndUpdate(req.params.id, {
            progress: req.body.progress,
        }, { new: true });

        if (!task) return res.status(404).json({ message: "Task not found" });
        res.status(200).json(task);
    } catch (error) {
        res.status(500).json({ error: error.message });
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
    }
    
    return progress;
  } catch (error) {
    console.error('Error updating project progress:', error);
  }
};