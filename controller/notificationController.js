import notificationService from '../Service/notificationService.js';
import ApiResponse from '../utils/AoiResponse.js';
// import ApiError from '../utils/ApiError.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

export const notificationController = {
  // Get user notifications with filtering options
  getNotifications: asyncHandler(async (req, res) => {
    const userId = req.user._id;
    const { 
      limit = 20, 
      page = 1, 
      unreadOnly = false, 
      type 
    } = req.query;
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const options = { 
      limit: parseInt(limit), 
      skip, 
      unreadOnly: unreadOnly === 'true', 
      type 
    };
    
    const notifications = await notificationService.getUserNotifications(userId, options);
    const unreadCount = await notificationService.getUnreadCount(userId);
    
    return res.json(new ApiResponse(200, {
      notifications,
      unreadCount,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        hasMore: notifications.length === parseInt(limit)
      }
    }, "Notifications fetched"));
  }),
  
  // Get unread notification count
  getUnreadCount: asyncHandler(async (req, res) => {
    const userId = req.user._id;
    const count = await notificationService.getUnreadCount(userId);
    console.log('Unread count:', count);
    
    return res.json(new ApiResponse(200, { count }, "Unread count fetched"));
  }),
  
  // Mark a notification as read
  markAsRead: asyncHandler(async (req, res) => {
    console.log('Marking notification as read:', req.params.id);
    const { id } = req.params;
    console.log('Marking notification as read:', id);
    const notification = await notificationService.markAsRead(id);
    
    return res.json(new ApiResponse(200, { notification }, "Notification marked as read"));
  }),
  
  // Mark all notifications as read
  markAllAsRead: asyncHandler(async (req, res) => {
    const userId = req.user._id;
    await notificationService.markAllAsRead(userId);
    
    return res.json(new ApiResponse(200, {}, "All notifications marked as read"));
  }),
  
  // Delete a notification
  deleteNotification: asyncHandler(async (req, res) => {
    const { id } = req.params;
    await notificationService.deleteNotification(id);
    
    return res.json(new ApiResponse(200, {}, "Notification deleted"));
  }),
};

// You can also export individual methods if preferred
export const {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification
} = notificationController;

// Default export
export default notificationController;