import express from 'express';
import authMiddlewareHybrid from '../authmiddleware/authMiddleware.js';
import Group from '../models/Group.js';
import Project from '../models/Project.js';
import Message from '../models/messge.js';

const router = express.Router();

// Create a new group
router.post('/groups', authMiddlewareHybrid, async (req, res) => {
  try {
    const { name, projectId, isDefault, members } = req.body;

    // Validate input
    if (!name || !projectId) {
      return res.status(400).json({
        success: false,
        message: 'Name and projectId are required'
      });
    }

    // Check if project exists and user has access
    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({
        success: false,
        message: 'Project not found'
      });
    }

    // Check if user is member of the project
    const isMember = project.members.some(member => 
      member.userId.toString() === req.user._id.toString()
    );
    if (!isMember) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to create group in this project'
      });
    }

    // Check if default group already exists when trying to create one
    if (isDefault) {
      const existingDefault = await Group.findOne({ 
        projectId, 
        isDefault: true 
      });
      
      if (existingDefault) {
        return res.json({
          success: true,
          group: existingDefault
        });
      }
    }

    // Create new group
    const group = await Group.create({
      name,
      projectId,
      isDefault: isDefault || false,
      members: members.map(memberId => ({
        userId: memberId,
        role: memberId === req.user._id ? 'admin' : 'member'
      })),
      createdBy: req.user._id
    });

    // Add group to project
    await Project.findByIdAndUpdate(projectId, {
      $push: { groups: group._id }
    });

    // Populate creator details
    await group.populate('createdBy', 'name email profilePicture');
    await group.populate('members.userId', 'name email profilePicture');

    res.status(201).json({
      success: true,
      group
    });

  } catch (error) {
    if (error.code === 11000) {
      // Handle duplicate default group error
      return res.status(409).json({
        success: false,
        message: 'Default group already exists for this project'
      });
    }
    
    console.error('Create group error:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating group'
    });
  }
});

// Get project groups
router.get('/groups/project/:projectId', authMiddlewareHybrid, async (req, res) => {
  try {
    const { projectId } = req.params;

    const groups = await Group.find({ projectId,
        $or:[
            { "members.userId": req.user._id },
            { isDefault: true }
        ]
     })
      .populate('createdBy', 'name email profilePicture')
      .populate('members.userId', 'name email profilePicture')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      groups
    });

  } catch (error) {
    console.error('Get groups error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching groups'
    });
  }
});

// Store new message
router.post('/groups/:groupId/messages', authMiddlewareHybrid, async (req, res) => {
  try {
    const { groupId } = req.params;
    const { content, projectId } = req.body;

    // Validate group exists and user is member
    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({
        success: false,
        message: 'Group not found'
      });
    }

    // Check if user is member or if it's default group
    const isMember = group.isDefault || group.members.some(member => 
      member.userId.toString() === req.user._id.toString()
    );

    if (!isMember) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to send messages in this group'
      });
    }

    // Create and save message
    const message = await Message.create({
      content,
      sender: req.user._id,
      projectId,
      groupId,
      readBy: [{
        userId: req.user._id,
        readAt: new Date()
      }]
    });

    // Populate sender details
    await message.populate('sender', 'username email profilePicture');

    res.status(201).json({
      success: true,
      message
    });

  } catch (error) {
    console.error('Store message error:', error);
    res.status(500).json({
      success: false,
      message: 'Error storing message'
    });
  }
});

// Get group messages
router.get('/groups/:groupId/messages', authMiddlewareHybrid, async (req, res) => {
  try {
    const { groupId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;

    // Validate group exists and user is member
    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({
        success: false,
        message: 'Group not found'
      });
    }

    const isMember = group.isDefault || group.members.some(member => 
      member.userId.toString() === req.user._id.toString()
    );

    if (!isMember) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to view messages in this group'
      });
    }

    // Get messages with pagination
    const messages = await Message.find({ groupId })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('sender', 'username email profilePicture');

    // Get total count for pagination
    const total = await Message.countDocuments({ groupId });

    res.json({
      success: true,
      messages: messages.reverse(),
      pagination: {
        page,
        pages: Math.ceil(total / limit),
        total
      }
    });

  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching messages'
    });
  }
});

router.patch('/groups/:groupId/members', authMiddlewareHybrid, async (req, res) => {
  try {
    const { groupId } = req.params;
    const { newMembers } = req.body; // expecting an array of userIds to add
    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ success: false, message: "Group not found" });
    }
    // Only the group creator (or admin) can add new members
    if (group.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: "Not authorized to add members" });
    }
    // Add each new member if not already in the group
    newMembers.forEach(memberId => {
      if (!group.members.some(m => m.userId.toString() === memberId)) {
        group.members.push({ userId: memberId, role: 'member' });
      }
    });
    await group.save();
    res.json({ success: true, group });
  } catch (error) {
    console.error('Add members error:', error);
    res.status(500).json({ success: false, message: "Error adding members" });
  }
});


router.delete('/groups/:groupId', authMiddlewareHybrid, async (req, res) => {
  try {
    const { groupId } = req.params;
    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ success: false, message: "Group not found" });
    }
    // Only the group creator (or admin) can delete the group
    if (group.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: "Not authorized to delete this group" });
    }
    await Group.findByIdAndDelete(groupId);
    res.json({ success: true, message: "Group deleted successfully" });
  } catch (error) {
    console.error('Delete group error:', error);
    res.status(500).json({ success: false, message: "Error deleting group" });
  }
});

export default router;