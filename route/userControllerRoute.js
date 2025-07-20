import express from 'express';
import { getUserTasks } from '../controller/useController.js';
import authMiddlewareHybrid from '../authmiddleware/authMiddleware.js';

const router = express.Router();    

router.get('/tasks', authMiddlewareHybrid, getUserTasks);

export default router;