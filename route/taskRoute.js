import express from 'express';
import authMiddlewareHybrid from '../authmiddleware/authMiddleware.js';
import {
  createTask,
  getTasks,
  getTaskById,
  updateTask,
  deleteTask,
  assignUsers,
  unassignUser,
  addSubtask,
  updateProgress,
} from '../controller/TaskController.js';


const router = express.Router();

router.use(authMiddlewareHybrid);

// Create a new task
router.post('/', createTask);

// Get all tasks
router.get('/', getTasks);

// Get a specific task by ID
router.get('/:id', getTaskById);

// Update a task
router.put('/:id', updateTask);

// Delete a task
router.delete('/:id', deleteTask);

// Assign users to a task
router.put('/:id/assign', assignUsers);

// Unassign a user from a task
router.put('/:id/unassign', unassignUser);

// Add a subtask to a task
router.put('/:id/subtask', addSubtask);

// Update progress of a task
router.put('/:id/progress', updateProgress);

export default router;