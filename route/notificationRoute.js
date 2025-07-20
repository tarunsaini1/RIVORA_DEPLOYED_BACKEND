import express from 'express';
import { 
  getNotifications, 
  getUnreadCount, 
  markAsRead, 
  markAllAsRead, 
  deleteNotification 
} from '../controller/notificationController.js';

import authMiddlewareHybrid from '../authmiddleware/authMiddleware.js';
const router = express.Router();

// Apply authentication middleware to all routes

router.use(authMiddlewareHybrid);

// Notification routes
router.get('/', getNotifications);
router.get('/unread-count', getUnreadCount);
router.put('/:id/mark-read', markAsRead);
router.put('/mark-all-read', markAllAsRead);
router.delete('/:id', deleteNotification);

export default router;