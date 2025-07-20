import Notification from "../models/NotifiacationSchema.js";
import User from "../models/User.js";
import socketService from "./notificationSocket.js";

const createSimpleLogger = () => {
  const log = (level, ...args) => console[level](`[${new Date().toISOString()}] [${level.toUpperCase()}]`, ...args);
  return {
    error: (...args) => log('error', ...args),
    warn: (...args) => log('warn', ...args),
    info: (...args) => log('info', ...args),
    debug: (...args) => log('debug', ...args),
  };
};

// Try to import the logger, fall back to simple logger if not available
let logger;
try {
  const loggerModule = await import('../utils/logger.js');
  logger = loggerModule.default;
} catch (err) {
  logger = createSimpleLogger();
  logger.warn('Logger module not found in notificationService, using simple logger');
}


// Priority mapping by notification type
const PRIORITY_MAP = {
  connection_request: 'high',
  team_invite: 'high',
  project_invite: 'high',
  task_assigned: 'high',
  mention: 'high',
  message: 'medium',
  team_join: 'medium',
  team_leave: 'medium',
  team_role_change: 'medium',
  project_update: 'medium',
  connection_accepted: 'medium',
  task_completed: 'low',
  task_deadline: 'medium',
  system: 'low'
};

// Helper to get expiration dates
const getExpirationDate = (type) => {
  const now = new Date();
  switch (type) {
    case 'connection_request':
    case 'team_invite': 
    case 'project_invite':
      return new Date(now.setDate(now.getDate() + 30)); // 30 days
    case 'message':
    case 'mention':
      return new Date(now.setDate(now.getDate() + 14)); // 14 days
    case 'team_join':
    case 'team_leave':
    case 'team_role_change':
    case 'task_assigned':
    case 'task_completed':
    case 'connection_accepted':
      return new Date(now.setDate(now.getDate() + 7)); // 7 days
    default:
      return new Date(now.setDate(now.getDate() + 5)); // Default 5 days
  }
};

const notificationService = {
  /**
   * Creates a notification and sends it via socket if recipient is online
   */
  async createNotification({
    recipientId,
    type,
    title,
    content,
    senderId = null,
    entityType = null,
    entityId = null,
    actionUrl = null,
    metaData = {},
    priority = null
  }) {
    try {
      // Auto-assign priority based on type if not provided
      const finalPriority = priority || PRIORITY_MAP[type] || 'medium';
      
      // Set expiration date based on type
      const expiresAt = getExpirationDate(type);
      
      const notification = new Notification({
        recipient: recipientId,
        type,
        priority: finalPriority,
        title,
        content,
        sender: senderId,
        entityType,
        entityId,
        actionUrl,
        metaData,
        expiresAt
      });
      
      await notification.save();
      
      // Get unread count for badge updates
      const unreadCount = await this.getUnreadCount(recipientId);
      
      // Prepare notification for socket transmission with sender details
      const notificationForSocket = notification.toObject();
      
      // Include sender details if available
      if (senderId) {
        try {
          const sender = await User.findById(senderId).select('name username profilePicture');
          if (sender) {
            notificationForSocket.sender = {
              _id: sender._id,
              name: sender.name,
              username: sender.username,
              profilePicture: sender.profilePicture
            };
          }
        } catch (err) {
          console.log('Error fetching sender details for socket', err);
        }
      }
      
      // Add unread count for badge updates
      notificationForSocket.unreadCount = unreadCount;
      
      // Emit to socket if available
      try {
        socketService.sendNotification(recipientId, notificationForSocket);
      } catch (socketErr) {
        console.log('Socket transmission error (non-critical):', socketErr);
        // Non-critical error, notification is already saved in database
      }
      
      return notification;
    } catch (error) {
      console.error('Error creating notification:', error);
      throw error;
    }
  },
  
  /**
   * Fetch notifications for a user with pagination and filtering
   */
  async getUserNotifications(userId, options = {}) {
    const { 
      limit = 10, 
      page = 1, 
      read, 
      type,
      priority,
      sort = { createdAt: -1 } 
    } = options;
    
    try {
      const query = { recipient: userId };
      
      // Apply filters if provided
      if (read !== undefined) query.read = read;
      if (type) query.type = type;
      if (priority) query.priority = priority;
      
      // Count total for pagination
      const total = await Notification.countDocuments(query);
      
      // Execute query with pagination
      const notifications = await Notification.find(query)
        .populate('sender', 'name username profilePicture')
        .sort(sort)
        .skip((page - 1) * limit)
        .limit(limit)
        .lean();
      
      return {
        notifications,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(total / limit)
        }
      };
    } catch (error) {
      console.error('Error fetching user notifications:', error);
      throw error;
    }
  },
  
  /**
   * Get unread notification count for a user
   */
  async getUnreadCount(userId) {
    try {
      const count = await Notification.countDocuments({ 
        recipient: userId,
        read: false
      });
      return count;
    } catch (error) {
      console.error('Error getting unread count:', error);
      throw error;
    }
  },
  
  /**
   * Mark a notification as read
   */
  async markAsRead(notificationId, userId = null) {
    try {
      const query = { _id: notificationId };
      if (userId) query.recipient = userId; // Add recipient check for security
      
      const notification = await Notification.findOneAndUpdate(
        query,
        { read: true, readAt: new Date() },
        { new: true }
      );
      
      if (!notification) {
        throw new Error('Notification not found or access denied');
      }
      
      // Get updated count for socket update
      const unreadCount = await this.getUnreadCount(notification.recipient);
      
      // Emit count update via socket
      try {
        socketService.emitToUser(notification.recipient, 'notification_count', { count: unreadCount });
      } catch (err) {
        console.log('Non-critical socket error:', err);
      }
      
      return notification;
    } catch (error) {
      console.error('Error marking notification as read:', error);
      throw error;
    }
  },
  
  /**
   * Mark all notifications as read for a user
   */
  async markAllAsRead(userId) {
    try {
      const result = await Notification.updateMany(
        { recipient: userId, read: false },
        { read: true, readAt: new Date() }
      );
      
      // Emit count update via socket
      try {
        socketService.emitToUser(userId, 'notification_count', { count: 0 });
        socketService.emitToUser(userId, 'all_notifications_read');
      } catch (err) {
        console.log('Non-critical socket error:', err);
      }
      
      return { count: result.modifiedCount };
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
      throw error;
    }
  },
  
  /**
   * Delete a notification by ID (with optional user check)
   */
  async deleteNotification(notificationId, userId = null) {
    try {
      const query = { _id: notificationId };
      if (userId) query.recipient = userId; // Add recipient check for security
      
      const notification = await Notification.findOne(query);
      if (!notification) {
        throw new Error('Notification not found or access denied');
      }
      
      // Store recipient for later socket update
      const recipientId = notification.recipient;
      
      await Notification.deleteOne(query);
      
      // Get updated count for socket update
      const unreadCount = await this.getUnreadCount(recipientId);
      
      // Emit updates via socket
      try {
        socketService.emitToUser(recipientId, 'notification_count', { count: unreadCount });
        socketService.emitToUser(recipientId, 'notification_deleted', { id: notificationId });
      } catch (err) {
        console.log('Non-critical socket error:', err);
      }
      
      return { success: true };
    } catch (error) {
      console.error('Error deleting notification:', error);
      throw error;
    }
  },
  
  /**
   * Delete multiple notifications at once
   */
  async deleteMultipleNotifications(notificationIds, userId) {
    try {
      const result = await Notification.deleteMany({
        _id: { $in: notificationIds },
        recipient: userId
      });
      
      // Get updated count for socket update
      const unreadCount = await this.getUnreadCount(userId);
      
      // Emit updates via socket
      try {
        socketService.emitToUser(userId, 'notification_count', { count: unreadCount });
        socketService.emitToUser(userId, 'notifications_deleted', { ids: notificationIds });
      } catch (err) {
        console.log('Non-critical socket error:', err);
      }
      
      return { count: result.deletedCount };
    } catch (error) {
      console.error('Error deleting multiple notifications:', error);
      throw error;
    }
  },
  
  // Helper methods for common notification types
  async sendConnectionRequest(requesterId, recipientId, message = '') {
    const requester = await User.findById(requesterId).select('name username profilePicture');
    
    return this.createNotification({
      recipientId,
      type: 'connection_request',
      title: 'New Connection Request',
      content: `${requester.name} wants to connect with you`,
      senderId: requesterId,
      entityType: 'user',
      entityId: requesterId,
      actionUrl: `/connections/requests`,
      metaData: { message }
    });
  },
  
  async sendTeamInvite(teamId, teamName, senderId, recipientId, role, message = '') {
    return this.createNotification({
      recipientId,
      type: 'team_invite',
      title: 'Team Invitation',
      content: `You've been invited to join ${teamName} as ${role}`,
      senderId,
      entityType: 'team',
      entityId: teamId,
      actionUrl: `/teams/invites`,
      metaData: { role, message }
    });
  },
  
  async sendTaskAssignment(taskId, taskName, projectId, projectName, senderId, recipientId) {
    return this.createNotification({
      recipientId,
      type: 'task_assigned',
      title: 'New Task Assigned',
      content: `You've been assigned to "${taskName}" in project ${projectName}`,
      senderId,
      entityType: 'task',
      entityId: taskId,
      actionUrl: `/projects/${projectId}/tasks/${taskId}`,
      metaData: { projectId, projectName }
    });
  },
  
  // New helper methods
  
  /**
   * Notify user about an approaching task deadline
   */
  async sendDeadlineReminder(recipientId, taskId, taskName, projectId, projectName, daysRemaining) {
    // Set appropriate title and content based on urgency
    let title, content, priority;
    
    if (daysRemaining <= 1) {
      title = `Urgent: Task Due ${daysRemaining === 0 ? 'Today' : 'Tomorrow'}`;
      content = `Task "${taskName}" in ${projectName} is due ${daysRemaining === 0 ? 'today' : 'tomorrow'}!`;
      priority = 'high';
    } else {
      title = `Task Due in ${daysRemaining} Days`;
      content = `Your task "${taskName}" in ${projectName} is due in ${daysRemaining} days`;
      priority = 'medium';
    }
    
    return this.createNotification({
      recipientId,
      type: 'task_deadline',
      title,
      content,
      entityType: 'task',
      entityId: taskId,
      actionUrl: `/projects/${projectId}/tasks/${taskId}`,
      priority,
      metaData: {
        projectId,
        projectName,
        daysRemaining
      }
    });
  },
  
  /**
   * Notify about task status change
   */
  async sendTaskStatusUpdate(recipientId, taskId, taskName, projectId, projectName, newStatus, updaterId, updaterName) {
    // Customize message based on status
    let title, content;
    
    if (newStatus.toLowerCase() === 'completed' || newStatus.toLowerCase() === 'done') {
      title = 'Task Completed';
      content = `Task "${taskName}" was marked as completed by ${updaterName}`;
    } else {
      title = 'Task Status Changed';
      content = `Task "${taskName}" status changed to ${newStatus} by ${updaterName}`;
    }
    
    return this.createNotification({
      recipientId,
      type: 'task_status',
      title,
      content,
      senderId: updaterId,
      entityType: 'task',
      entityId: taskId,
      actionUrl: `/projects/${projectId}/tasks/${taskId}`,
      priority: newStatus.toLowerCase() === 'completed' ? 'high' : 'medium',
      metaData: {
        projectId,
        projectName,
        newStatus
      }
    });
  }
};

export default notificationService;