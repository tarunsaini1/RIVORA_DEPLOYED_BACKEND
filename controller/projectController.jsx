import express from 'express';
import Project from '../models/Project.js';
import redisClient from '../config/redis.js';
import User from '../models/User.js';
import { Task } from '../models/TaskModel.js';
import Group from '../models/Group.js';

export const createProject = async (req, res) => {
    try {
        // First verify user is authenticated
        if (!req.user || !req.user._id) {
            return res.status(401).json({
                success: false,
                message: 'User not authenticated'
            });
        }

        const { name, description, deadline, priority } = req.body;

        // Validate required fields
        if (!name || !deadline) {
            return res.status(400).json({
                success: false,
                message: 'Name and deadline are required'
            });
        }

        const newProject = await Project.create({
            name,
            description,
            deadline,
            priority,
            owner: req.user._id,
            members: [{userId: req.user._id, role: 'admin'}]
        });

        // Clear cache after successful creation
        try {
            await redisClient.del("projects:" + req.user._id);
        } catch (redisError) {
            console.log(`Redis Error: ${redisError.message}`);
        }

        return res.status(201).json({
            success: true,
            message: 'Project created successfully',
            project: newProject
        });

d    } catch (error) {
        console.error(`Error creating project: ${error.message}`);
        return res.status(500).json({
            success: false,
            message: error.message || 'Failed to create project'
        });
    }
};


// Improved getProjects function
export const getProjects = async (req, res) => {
    try {
        const { search, status, priority, page = 1, limit = 10 } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);

        // Build query object
        const query = {
            members: { $elemMatch: { userId: req.user._id } },
            currentStatus: { $ne: 'archived' } // Don't show archived projects by default
        };

        if (search) {
            query.$or = [
                { name: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } }
            ];
        }
        if (status) query.status = status;
        if (priority) query.priority = priority;

        // Get total count for pagination
        const total = await Project.countDocuments(query);
        
        const projects = await Project.find(query)
            .skip(skip)
            .limit(parseInt(limit))
            .sort({ createdAt: -1 });

        return res.json({
            success: true,
            projects,
            pagination: {
                total,
                page: parseInt(page),
                pages: Math.ceil(total / parseInt(limit))
            }
        });

    } catch (error) {
        console.error(`Error fetching projects: ${error.message}`);
        return res.status(500).json({
            success: false,
            message: 'Failed to fetch projects'
        });
    }
};

//
export const getProjectById = async (req, res) => {
  try {
    const project = await Project.findById(req.params.id)
      .populate({
        path: 'members.userId',
        select: 'username email profilePicture'
      })
      .populate('owner', 'username email profilePicture')
      .lean(); // Add lean() for better performance

    console.log('Backend project members:', project.members);
    
    if (!project) {
      return res.status(404).json({ 
        success: false, 
        message: 'Project not found' 
      });
    }

    res.json({ 
      success: true, 
      project 
    });
  } catch (error) {
    console.error('Get project error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error fetching project',
      error: error.message 
    });
  }
};


// export const updateProject = async (req, res) => {
//     try {
//           const project = await Project.findById(req.params.id);
//         if (!project) {
//             return res.status(404).json({ success: false, message: 'Project not found' });
//         }
        
//         if(project.owner.toString() !== req.user.id)
//         {
//             return res.status(401).json({ success: false, message: 'You are not authorized to update this project' });
//         }

//         const updatedProject = await Project.findByIdAndUpdate(req.params.id, req.body, {new: true, runValidators: true});

//         try{
//             await redisClient.del("projects"+ req.user.id);
//         }catch (error) {
//             console.log(`Redis Deleting Error: ${error.message}`);
//         }

//         res.json({ success: true, project: updatedProject });


//     } catch (error) {
//         console.log(`Error: ${error.message}`);
        
//     }

// }

export const updateProject = async (req, res) => {
    try {
        const project = await Project.findById(req.params.id);
        if (!project) {
            return res.status(404).json({ success: false, message: 'Project not found' });
        }
        
        if(project.owner.toString() !== req.user.id) {
            return res.status(401).json({ success: false, message: 'You are not authorized to update this project' });
        }

       
        const updateData = { ...req.body };
        
        if (req.body.status === 'active') {
            
            updateData.currentStatus = project.currentStatus === 'available' ? 
                'available' : 'in_progress';
        } else if (req.body.status) {
            
            if (['completed', 'archived'].includes(req.body.status)) {
                updateData.currentStatus = req.body.status;
            }
        }
        
        // // If client is trying to directly update currentStatus, respect that
        // console.log('Update data before DB call:', updateData);

        const updatedProject = await Project.findByIdAndUpdate(
            req.params.id, 
            updateData, 
            {new: true, runValidators: true}
        );

        // console.log('Updated project:', updatedProject);

        try {
            await redisClient.del("projects:" + req.user.id);
        } catch (error) {
            console.log(`Redis Deleting Error: ${error.message}`);
        }

        res.json({ success: true, project: updatedProject });
    } catch (error) {
        console.log(`Error: ${error.message}`, error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to update project',
            error: error.message
        });
    }
}
//delete project

export const deleteProject = async (req, res) => {
    try {
        // Debug logs
        console.log('User in request:', req.user);
        console.log('Project ID:', req.params.id);

        // First verify user is authenticated
        if (!req.user || !req.user._id) {
            return res.status(401).json({
                success: false,
                message: 'User not authenticated'
            });
        }

        const project = await Project.findById(req.params.id);
        if (!project) {
            return res.status(404).json({ 
                success: false, 
                message: 'Project not found' 
            });
        }

        // Debug log
        console.log('Project owner:', project.owner);
        console.log('Current user:', req.user._id);
        console.log('Comparison:', project.owner.toString() === req.user._id.toString());

        // Compare IDs using toString()
        if (project.owner.toString() !== req.user._id.toString()) {
            return res.status(401).json({ 
                success: false, 
                message: 'You are not authorized to delete this project' 
            });
        }

        const archivedProject = await Project.findByIdAndUpdate(
            req.params.id,
            {
                currentStatus: 'archived',
                lastUpdated: Date.now()
            },
            { new: true, runValidators: true }
        );

        // Clear the cache
        try {
            await redisClient.del(`projects:${req.user._id}`);
            await redisClient.del(`project:${req.params.id}`);
        } catch (error) {
            console.log(`Redis Deleting Error: ${error.message}`);
        }

        return res.json({ 
            success: true, 
            message: 'Project archived successfully',
            project: archivedProject 
        });

    } catch (error) {
        console.error('Delete project error:', error);
        return res.status(500).json({ 
            success: false, 
            message: 'Failed to archive project',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};


// Update project member role
export const updateMemberRole = async (req, res) => {
    console.log('Update member role request:', req.body);
  try {
    const { projectId, userId } = req.params;
    const { role } = req.body;
    
    // Validate role
    const validRoles = ['admin', 'member', 'viewer'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ message: 'Invalid role. Must be admin, member, or viewer.' });
    }
    
    // Check if project exists
    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }
    
    // Check if current user is admin in this project
    const currentUserMember = project.members.find(
      m => m.userId.toString() === req.user.id || m._id.toString() === req.user.id
    );
    
    if (!currentUserMember || currentUserMember.role !== 'admin') {
      return res.status(403).json({ message: 'Only project admins can update member roles' });
    }
    
    // Find the member and update role
    const memberIndex = project.members.findIndex(
      m => m.userId.toString() === userId || m._id.toString() === userId
    );
    
    if (memberIndex === -1) {
      return res.status(404).json({ message: 'Member not found in this project' });
    }
    
    // Update the role
    project.members[memberIndex].role = role;
    await project.save();
    
    return res.status(200).json({
      message: 'Member role updated successfully',
      member: project.members[memberIndex]
    });
  } catch (error) {
    console.error('Error updating member role:', error);
    return res.status(500).json({ message: 'Failed to update member role', error: error.message });
  }
};

// Add these controller methods to your existing ProjectController.js

// Remove a member from the project
export const removeMember = async (req, res) => {
  try {
    const { projectId, userId } = req.params;
    
    // Check if project exists
    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }
    
    // Check if current user is admin in this project
    const currentUserMember = project.members.find(
      m => m.userId.toString() === req.user.id || m._id.toString() === req.user.id
    );
    
    if (!currentUserMember || currentUserMember.role !== 'admin') {
      return res.status(403).json({ message: 'Only project admins can remove members' });
    }
    
    // Find the member to remove
    const memberIndex = project.members.findIndex(
      m => m.userId.toString() === userId || m._id.toString() === userId
    );
    
    if (memberIndex === -1) {
      return res.status(404).json({ message: 'Member not found in this project' });
    }
    
    // Remove the member
    project.members.splice(memberIndex, 1);
    await project.save();
    
    return res.status(200).json({
      message: 'Member removed successfully',
      projectId: project._id
    });
  } catch (error) {
    console.error('Error removing member:', error);
    return res.status(500).json({ message: 'Failed to remove member', error: error.message });
  }
};

// Leave a project (remove yourself)
export const leaveProject = async (req, res) => {
  try {
    const { projectId } = req.params;
    
    // Check if project exists
    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }
    
    // Find the current user in the project members
    const memberIndex = project.members.findIndex(
      m => m.userId.toString() === req.user.id || m._id.toString() === req.user.id
    );
    
    if (memberIndex === -1) {
      return res.status(404).json({ message: 'You are not a member of this project' });
    }
    
    // Check if user is leaving as the last admin
    if (project.members[memberIndex].role === 'admin') {
      const adminCount = project.members.filter(m => 
        m.role === 'admin' && 
        (m.userId.toString() !== req.user.id && m._id.toString() !== req.user.id)
      ).length;
      
      if (adminCount === 0) {
        return res.status(400).json({ 
          message: 'You are the only admin of this project. Promote another member to admin before leaving.'
        });
      }
    }
    
    // Remove the member
    project.members.splice(memberIndex, 1);
    await project.save();
    
    return res.status(200).json({
      message: 'You have left the project successfully',
      projectId: project._id
    });
  } catch (error) {
    console.error('Error leaving project:', error);
    return res.status(500).json({ message: 'Failed to leave project', error: error.message });
  }
};