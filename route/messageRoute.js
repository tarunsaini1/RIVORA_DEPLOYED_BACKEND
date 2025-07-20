import express from 'express';
import  Message  from '../models/messge.js';
import authMiddlewareHybrid from '../authmiddleware/authMiddleware.js';
import Project from '../models/Project.js';

const router = express.Router();

// Get project messages
router.get('/projects/:projectId/messages', authMiddlewareHybrid, async (req, res) => {
  try {
    const { projectId } = req.params;
    const { page = 1, limit = 50 } = req.query;

    // Verify project membership
    const project = await Project.findById(projectId);
    const isMember = project.members.some(member => 
      member.userId.toString() === req.user._id.toString()
    );

    if (!isMember) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to access this project\'s messages'
      });
    }

    const messages = await Message.find({ projectId })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .populate('sender', 'name profilePicture')
      .populate('mentions', 'name profilePicture');

    const total = await Message.countDocuments({ projectId });

    res.json({
      success: true,
      data: {
        messages,
        pagination: {
          total,
          page: parseInt(page),
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch messages'
    });
  }
});

// Get unread messages count
router.get('/projects/:projectId/unread', authMiddlewareHybrid, async (req, res) => {
  try {
    const { projectId } = req.params;
    
    const unreadCount = await Message.countDocuments({
      projectId,
      'readBy.userId': { $ne: req.user._id }
    });

    res.json({
      success: true,
      data: { unreadCount }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch unread count'
    });
  }
});

// Mark messages as read
router.post('/messages/mark-read', authMiddlewareHybrid, async (req, res) => {
  try {
    const { messageIds } = req.body;

    await Message.updateMany(
      { _id: { $in: messageIds } },
      {
        $addToSet: {
          readBy: {
            userId: req.user._id,
            readAt: new Date()
          }
        }
      }
    );

    res.json({
      success: true,
      message: 'Messages marked as read'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to mark messages as read'
    });
  }
});

export default router;