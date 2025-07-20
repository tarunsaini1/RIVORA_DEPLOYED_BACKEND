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

        console.log('User in request:', req.body);

        const newProject = await Project.create({
            name,
            description,
            deadline,
            priority,
            owner: req.user._id,
            members: [{userId: req.user._id, role: 'admin'}]
        });

        console.log(newProject);

         const defaultGroup = await Group.create({
          name: 'General',
          projectId: newProject._id,
          isDefault: true,
          members: [
            {
              userId: req.user._id,
              role: 'admin',
              joinedAt: new Date()
            }
          ],
          createdBy: req.user._id,
          description: 'Default project discussion group'
        });

        // Add group reference to project
        await Project.findByIdAndUpdate(newProject._id, {
          $push: { groups: defaultGroup._id }
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
            project: {
            ...newProject.toObject(),
            defaultGroup: defaultGroup
      }
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
        const { search, status, priority, page = 1, limit = 50 } = req.query;
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
// export const getProjectById = async (req, res) => {
//   try {
//     const project = await Project.findById(req.params.id)
//       .populate({
//         path: 'members.userId',
//         select: 'username email profilePicture'
//       })
//       .populate('owner', 'username email profilePicture')
//       .lean(); // Add lean() for better performance

//     console.log('Backend project members:', project.members);
    
//     if (!project) {
//       return res.status(404).json({ 
//         success: false, 
//         message: 'Project not found' 
//       });
//     }

//     res.json({ 
//       success: true, 
//       project 
//     });
//   } catch (error) {
//     console.error('Get project error:', error);
//     res.status(500).json({ 
//       success: false, 
//       message: 'Error fetching project',
//       error: error.message 
//     });
//   }
// };

export const getProjectById = async (req, res) => {
  try {
    const currentUserId = req.user._id.toString();
    console.log('Current user ID:', currentUserId);
    
    // First, find the project without populating to check permissions
    const projectCheck = await Project.findById(req.params.id);
    
    if (!projectCheck) {
      return res.status(404).json({ 
        success: false, 
        message: 'Project not found' 
      });
    }

    // Check if the user is the owner, a member, admin, or viewer of the project
    const isOwner = projectCheck.owner.toString() === currentUserId;
    const isMember = projectCheck.members.some(member => 
      (member.userId.toString() === currentUserId) && 
      ['admin', 'member', 'viewer'].includes(member.role)
    );
    
   
    if (!isOwner && !isMember) {
      return res.status(404).json({ 
        success: false, 
        message: 'Project not found or you do not have access'
      });
    }
    
    // User has permission, now fetch the project with populated fields
    const project = await Project.findById(req.params.id)
      .populate({
        path: 'members.userId',
        select: 'username email profilePicture'
      })
      .populate('owner', 'username email profilePicture')
      .lean(); // Add lean() for better performance

    // For debugging purposes
    console.log('Backend project members:', project.members);
    
    // Add user role information for frontend use
    let userRole = 'viewer';
    if (isOwner) {
      userRole = 'owner';
    } else {
      const memberInfo = project.members.find(member => 
        member.userId && member.userId._id && member.userId._id.toString() === currentUserId
      );
      if (memberInfo) {
        userRole = memberInfo.role;
      }
    }

    res.json({ 
      success: true, 
      project,
      userRole // Include the user's role in the response
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
// export const removeMember = async (req, res) => {
//   try {
//     const { projectId, userId } = req.params;
    
//     // Check if project exists
//     const project = await Project.findById(projectId);
//     if (!project) {
//       return res.status(404).json({ message: 'Project not found' });
//     }
    
//     // Check if current user is admin in this project
//     const currentUserMember = project.members.find(
//       m => m.userId.toString() === req.user.id || m._id.toString() === req.user.id
//     );
    
//     if (!currentUserMember || currentUserMember.role !== 'admin') {
//       return res.status(403).json({ message: 'Only project admins can remove members' });
//     }
    
//     // Find the member to remove
//     const memberIndex = project.members.findIndex(
//       m => m.userId.toString() === userId || m._id.toString() === userId
//     );
    
//     if (memberIndex === -1) {
//       return res.status(404).json({ message: 'Member not found in this project' });
//     }
    
//     // Remove the member
//     project.members.splice(memberIndex, 1);
//     await project.save();
    
//     return res.status(200).json({
//       message: 'Member removed successfully',
//       projectId: project._id
//     });
//   } catch (error) {
//     console.error('Error removing member:', error);
//     return res.status(500).json({ message: 'Failed to remove member', error: error.message });
//   }
// };

// // Leave a project (remove yourself)
// export const leaveProject = async (req, res) => {
//   try {
//     const { projectId } = req.params;
    
//     // Check if project exists
//     const project = await Project.findById(projectId);
//     if (!project) {
//       return res.status(404).json({ message: 'Project not found' });
//     }
    
//     // Find the current user in the project members
//     const memberIndex = project.members.findIndex(
//       m => m.userId.toString() === req.user.id || m._id.toString() === req.user.id
//     );
    
//     if (memberIndex === -1) {
//       return res.status(404).json({ message: 'You are not a member of this project' });
//     }
    
//     // Check if user is leaving as the last admin
//     if (project.members[memberIndex].role === 'admin') {
//       const adminCount = project.members.filter(m => 
//         m.role === 'admin' && 
//         (m.userId.toString() !== req.user.id && m._id.toString() !== req.user.id)
//       ).length;
      
//       if (adminCount === 0) {
//         return res.status(400).json({ 
//           message: 'You are the only admin of this project. Promote another member to admin before leaving.'
//         });
//       }
//     }
    
//     // Remove the member
//     project.members.splice(memberIndex, 1);
//     await project.save();
    
//     return res.status(200).json({
//       message: 'You have left the project successfully',
//       projectId: project._id
//     });
//   } catch (error) {
//     console.error('Error leaving project:', error);
//     return res.status(500).json({ message: 'Failed to leave project', error: error.message });
//   }
// };

export const removeMember = async (req, res) => {
  console.log('Remove member request:', req.params);  
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
    
    // 1. Remove the member from the project
    project.members.splice(memberIndex, 1);
    await project.save();
    
    // 2. Remove the member from project group discussions
    const projectGroups = await Group.find({ projectId: projectId });
    console.log("Found project groups:", projectGroups.length);

    if (projectGroups.length > 0) {
      for (const group of projectGroups) {
        // Print members for debugging
        console.log(`Group ${group._id} members before:`, JSON.stringify(group.members.map(m => m.userId), null, 2));
        
        // Remove member from each group - pull the object where userId matches
        await Group.updateOne(
          { _id: group._id },
          { $pull: { members: { userId: userId } } }
        );
        
        // Verify removal
        const updatedGroup = await Group.findById(group._id);
        console.log(`Group ${group._id} members after:`, JSON.stringify(updatedGroup.members.map(m => m.userId), null, 2));
        console.log(`Removed user ${userId} from group ${group._id}`);
      }
    }
    
    // 3. Handle tasks assigned to the member
    const userTasks = await Task.find({ 
      projectId: projectId, 
      assignedTo: userId
    });
    
    if (userTasks.length > 0) {
      // Option 1: Reassign tasks to the project owner or admin
      // This is one approach; adjust based on your business logic
      for (const task of userTasks) {
        // Find an admin to reassign to (can be project owner or first admin)
        const adminMember = project.members.find(m => m.role === 'admin');
        const newAssignee = adminMember ? adminMember.userId : project.owner;
        
        await Task.updateOne(
          { _id: task._id },
          { 
            assignedTo: newAssignee,
            $push: { 
              history: {
                action: 'reassigned',
                fromUser: userId,
                toUser: newAssignee,
                date: new Date(),
                reason: 'Member removed from project'
              }
            }
          }
        );
        
        console.log(`Reassigned task ${task._id} from user ${userId} to ${newAssignee}`);
      }
    }
    
    return res.status(200).json({
      message: 'Member removed successfully from project, groups, and tasks reassigned',
      projectId: project._id
    });
  } catch (error) {
    console.error('Error removing member:', error);
    return res.status(500).json({ message: 'Failed to remove member', error: error.message });
  }
};



// Leave a project (remove yourself)
export const leaveProject = async (req, res) => {
  console.log('Leave project request:', req.params);
  try {
    const { projectId } = req.params;
    console.log('Leave project request:', req.params);
    const currentUserId = req.user._id || req.user.id;
    
    console.log('Current user ID:', currentUserId);
    console.log('Project ID from params:', projectId);
    
    // Check if project exists
    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({ 
        success: false,
        message: 'Project not found' 
      });
    }
    
    // Find the current user in the project members - fix the comparison
    const memberIndex = project.members.findIndex(m => {
      const memberId = m.userId.toString();
      const userIdMatch = memberId === currentUserId.toString();
      const matchResult = userIdMatch;
      
      console.log(`Comparing member ${memberId} with user ${currentUserId.toString()}: ${matchResult}`);
      
      return matchResult;
    });
    
    console.log('Member index found:', memberIndex);
    
    if (memberIndex === -1) {
      return res.status(404).json({ 
        success: false,
        message: 'You are not a member of this project' 
      });
    }
    
    // Check if user is leaving as the last admin
    if (project.members[memberIndex].role === 'admin') {
      const adminCount = project.members.filter(m => 
        m.role === 'admin' && 
        (m.userId.toString() !== currentUserId && m._id.toString() !== currentUserId)
      ).length;
      
      if (adminCount === 0) {
        return res.status(400).json({ 
          message: 'You are the only admin of this project. Promote another member to admin before leaving.'
        });
      }
    }
    
    // 1. Remove the member
    project.members.splice(memberIndex, 1);
    await project.save();
    
    // 2. Remove the member from all project groups
    const projectGroups = await Group.find({ projectId: projectId });
    console.log("Found project groups for leaving user:", projectGroups.length);

    if (projectGroups.length > 0) {
      for (const group of projectGroups) {
        // Print members for debugging
        console.log(`Group ${group._id} members before:`, JSON.stringify(group.members.map(m => m.userId), null, 2));
        
        // Remove member from each group - pull the object where userId matches
        await Group.updateOne(
          { _id: group._id },
          { $pull: { members: { userId: currentUserId } } }
        );
        
        // Verify removal
        const updatedGroup = await Group.findById(group._id);
        console.log(`Group ${group._id} members after:`, JSON.stringify(updatedGroup.members.map(m => m.userId), null, 2));
        console.log(`Removed user ${currentUserId} from group ${group._id}`);
      }
    }
    
    // 3. Handle tasks assigned to the current user
    const userTasks = await Task.find({ 
      projectId: projectId, 
      assignedTo: currentUserId
    });
    
    if (userTasks.length > 0) {
      // Find a suitable admin to reassign tasks to
      const adminMember = project.members.find(m => 
        m.role === 'admin' && 
        (m.userId.toString() !== currentUserId)
      );
      const newAssignee = adminMember ? adminMember.userId : project.owner;
      
      for (const task of userTasks) {
        await Task.updateOne(
          { _id: task._id },
          { 
            assignedTo: newAssignee,
            $push: { 
              history: {
                action: 'reassigned',
                fromUser: currentUserId,
                toUser: newAssignee,
                date: new Date(),
                reason: 'Member left project'
              }
            }
          }
        );
        console.log(`Reassigned task ${task._id} from leaving user to ${newAssignee}`);
      }
    }
    
    return res.status(200).json({
      success: true,
      message: 'You have left the project successfully. Tasks reassigned to project admin.',
      projectId: project._id
    });
  } catch (error) {
    console.error('Error leaving project:', error);
    return res.status(500).json({ 
      success: false,
      message: 'Failed to leave project', 
      error: error.message 
    });
  }
};