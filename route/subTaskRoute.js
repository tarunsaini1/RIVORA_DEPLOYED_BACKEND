import express from 'express';
import {
    addSubtask,
    removeSubtask,
    getSubtasks,
    updateSubtaskStatus,
    updateProgress
} from '../controller/SubTaskController.js';
import  authMiddlewareHybrid  from '../authmiddleware/authMiddleware.js'

const router = express.Router();

// Protected routes - require authentication
router.use(authMiddlewareHybrid);

// Subtask routes
router.post('/task/:taskId/subtasks', addSubtask);
router.delete('/subtasks/:subtaskId', removeSubtask);
router.get('/task/:id/subtasks', getSubtasks);
router.patch('/subtasks/:subtaskId/status', updateSubtaskStatus);
router.patch('/task/:taskId/progress', updateProgress); 

export default router;