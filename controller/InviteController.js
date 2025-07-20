import express from "express";
import mongoose from "mongoose";
import { Invitation } from "../models/Invitation.js";
import Project from "../models/Project.js";
import User from "../models/User.js";
import notificationService from "../Service/notificationService.js"; // Import notification service
import Group from "../models/Group.js";

export const searchUser = async (req, res) => {
    try {
        const { query } = req.query;
        if (!query) {
            return res.status(400).json({ success: false, message: 'Query is required' });
        }

        const users = await User.find({
            $or: [
                { username: { $regex: query, $options: 'i' } },
                { email: { $regex: query, $options: 'i' } }
            ]
        }).select('_id username name email role profilePicture');

        if (!users) {
            return res.status(404).json({ success: false, message: 'No users found' });
        }

        res.json({ success: true, users });

    } catch (error) {
        console.error('Search user error:', error);
        res.status(500).json({
            success: false, 
            message: 'Failed to search users',
            error: error.message
        });
    }
};

export const inviteUser = async (req, res) => {
    try {
        const { projectId, userId, role, message } = req.body;
        if (!projectId || !userId || !role) {
            return res.status(400).json({
                success: false,
                message: 'Project ID, User ID and Role are required'
            });
        }

        // First fetch the project
        const project = await Project.findById(projectId);
        if (!project) {
            return res.status(404).json({
                success: false,
                message: 'Project not found'
            });
        }

        // Check ownership
        if (project.owner.toString() !== req.user._id.toString()) {
            return res.status(401).json({
                success: false,
                message: 'You are not authorized to invite users to this project'
            });
        }

        // Check if user exists
        const existingUser = await User.findById(userId);
        if (!existingUser) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Check if there's already a pending invitation
        const existingInvitation = await Invitation.findOne({ 
            projectId, 
            inviteeEmail: existingUser.email,
            status: 'pending'
        });
        
        if (existingInvitation) {
            return res.status(400).json({
                success: false,
                message: 'User already has a pending invitation to this project'
            });
        }

        // Create new standalone invitation
        const invitation = await Invitation.create({
            projectId,
            userId,
            inviterId: req.user._id,
            inviteeEmail: existingUser.email,
            role,
            status: 'pending',
            message: message || ''
        });

        // Create notification for the invited user
        const inviter = await User.findById(req.user._id).select('name username');
        
        await notificationService.createNotification({
            recipientId: userId,
            type: 'project_invite',
            title: 'New Project Invitation',
            content: `${inviter.name} has invited you to join project "${project.name}" as ${role}`,
            senderId: req.user._id,
            entityType: 'project',
            entityId: projectId,
            actionUrl: `/projects/invites`,
            metaData: {
                invitationId: invitation._id,
                role: role,
                message: message || '',
                projectName: project.name
            }
        });

        res.status(201).json({ 
            success: true, 
            message: 'Invitation sent successfully',
            invitation 
        });

    } catch (error) {
        console.error('Invite user error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to send invitation',
            error: error.message
        });
    }
};

export const respondToInvitation = async (req, res) => {
    console.log('Respond to invitation:', req.body);
    try {
        const { invitationId, action } = req.body;
        const userId = req.user._id;

        // Validate required fields
        if (!invitationId) {
            return res.status(400).json({
                success: false,
                message: 'Invitation ID and action are required'
            });
        }

        // Validate action value
        if (!['accept', 'reject'].includes(action)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid action. Must be either "accept" or "reject"'
            });
        }

        // Ensure we have a valid ObjectId
        let objectId;
        try {
            objectId = new mongoose.Types.ObjectId(invitationId);
        } catch (err) {
            return res.status(400).json({
                success: false,
                message: 'Invalid invitation ID format'
            });
        }

        // Find the standalone invitation
        const invitation = await Invitation.findById(objectId)
            .populate('projectId', 'name description owner')
            .populate('inviterId', 'username email profilePicture');

        console.log('Found invitation:', invitation ? 'yes' : 'no');

        if (!invitation) {
            return res.status(404).json({
                success: false,
                message: 'Invitation not found'
            });
        }

        // Ensure this user is the intended recipient
        if (invitation.inviteeEmail !== req.user.email && 
            invitation.userId.toString() !== userId.toString()) {
            return res.status(403).json({
                success: false,
                message: 'You do not have permission to respond to this invitation'
            });
        }

        // Check if invitation is still pending
        if (invitation.status !== 'pending') {
            return res.status(400).json({
                success: false,
                message: `Invitation has already been ${invitation.status}`
            });
        }

        // Update invitation status
        invitation.status = action === 'accept' ? 'accepted' : 'rejected';
        invitation.respondedAt = new Date();
        invitation.respondedBy = userId;
        
        // If accepting, add user to project
        if (action === 'accept') {
            // Check if user is already a member
            const project = await Project.findById(invitation.projectId._id);
            if (!project) {
                return res.status(404).json({
                    success: false,
                    message: 'Project not found'
                });
            }

            const isAlreadyMember = project.members.some(
                member => member.userId.toString() === userId.toString()
            );

            if (!isAlreadyMember) {
                // First, find the default group
                const defaultGroup = await Group.findOne({
                    projectId: invitation.projectId._id,
                    isDefault: true
                });

                // Add user to project members
                await Project.findByIdAndUpdate(
                    invitation.projectId._id,
                    {
                        $push: {
                            members: {
                                userId,
                                role: invitation.role,
                                joinedAt: new Date()
                            }
                        }
                    }
                );

                // If default group exists, add user to it
                if (defaultGroup) {
                    try {
                        await Group.findByIdAndUpdate(
                            defaultGroup._id,
                            {
                                $push: {
                                    members: {
                                        userId,
                                        role: invitation.role,
                                        joinedAt: new Date()
                                    }
                                }
                            }
                        );
                        console.log('User added to default group successfully');
                    } catch (groupError) {
                        console.error('Error adding user to default group:', groupError);
                        // You might want to handle this error appropriately
                    }
                } else {
                    console.warn('No default group found for project:', invitation.projectId._id);
                }
            }

            // Create notification for project owner that invitation was accepted
            const currentUser = await User.findById(userId).select('name username');
            
            await notificationService.createNotification({
                recipientId: invitation.projectId.owner,
                type: 'project_update',
                title: 'Project Invitation Accepted',
                content: `${currentUser.name} has accepted your invitation to join "${invitation.projectId.name}" as ${invitation.role}`,
                senderId: userId,
                entityType: 'project',
                entityId: invitation.projectId._id,
                actionUrl: `/projects/${invitation.projectId._id}/members`,
                metaData: {
                    invitationId: invitation._id,
                    role: invitation.role,
                    projectName: invitation.projectId.name
                }
            });
            
            // If this was a team deployment invitation, also notify team owner
            if (invitation.teamDeployment && invitation.teamId) {
                try {
                    const team = await mongoose.model('Team').findById(invitation.teamId).select('name owner');
                    
                    if (team && team.owner.toString() !== invitation.projectId.owner.toString()) {
                        await notificationService.createNotification({
                            recipientId: team.owner,
                            type: 'team_update',
                            title: 'Team Member Joined Project',
                            content: `${currentUser.name} has joined project "${invitation.projectId.name}" from your team "${team.name}"`,
                            senderId: userId,
                            entityType: 'team',
                            entityId: invitation.teamId,
                            actionUrl: `/teams/${invitation.teamId}/members`,
                            metaData: {
                                projectId: invitation.projectId._id,
                                projectName: invitation.projectId.name,
                                role: invitation.role
                            }
                        });
                    }
                } catch (teamError) {
                    console.error('Error notifying team owner:', teamError);
                    // Continue execution even if team notification fails
                }
            }
            
        } else {
            // Rejected invitation - notify the project owner
            const currentUser = await User.findById(userId).select('name username');
            
            await notificationService.createNotification({
                recipientId: invitation.projectId.owner,
                type: 'project_update',
                title: 'Project Invitation Declined',
                content: `${currentUser.name} has declined your invitation to join "${invitation.projectId.name}"`,
                senderId: userId,
                entityType: 'project',
                entityId: invitation.projectId._id,
                actionUrl: `/projects/${invitation.projectId._id}/members`,
                priority: 'low',
                metaData: {
                    invitationId: invitation._id,
                    projectName: invitation.projectId.name
                }
            });
        }

        // Save the updated invitation
        await invitation.save();
        
        // Update the user's respondedInvitations list to track their responses
        await User.findByIdAndUpdate(
            userId,
            {
                $push: {
                    respondedInvitations: {
                        invitationId: invitation._id,
                        status: invitation.status,
                        respondedAt: invitation.respondedAt
                    }
                }
            }
        );

        // Return success response
        res.json({
            success: true,
            message: `Invitation ${action}ed successfully`,
            invitation
        });

    } catch (error) {
        console.error('Respond to invitation error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to respond to invitation',
            error: error.message
        });
    }
};

export const getMyInvitations = async (req, res) => {
    try {
        const userId = req.user._id;
        const userEmail = req.user.email;
        
        // Get all invitations for this user's email or userId
        const invitations = await Invitation.find({
            $or: [
                { inviteeEmail: userEmail },
                { userId: userId }
            ]
        })
        .populate('projectId', 'name description')
        .populate('inviterId', 'username email profilePicture name')
        .sort({ createdAt: -1 });
        
        console.log(`Found ${invitations.length} invitations for user ${userId}`);
        
        // Format invitations for frontend consistency
        const formattedInvitations = invitations.map(inv => ({
            invitationId: inv._id,
            inviterId: inv.inviterId,
            projectId: inv.projectId,
            role: inv.role,
            status: inv.status,
            message: inv.message || '',
            sentAt: inv.createdAt,
            respondedAt: inv.respondedAt,
            teamDeployment: inv.teamDeployment || false
        }));

        res.json({
            success: true,
            invitations: formattedInvitations
        });

    } catch (error) {
        console.error('Fetch invitations error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch invitations',
            error: error.message
        });
    }
};

export const resendInvitation = async (req, res) => {
    try {
        const { invitationId } = req.params;
        
        // Find the invitation
        const invitation = await Invitation.findById(invitationId)
            .populate('projectId', 'name description owner')
            .populate('userId', 'name email');
            
        if (!invitation) {
            return res.status(404).json({
                success: false,
                message: 'Invitation not found'
            });
        }
        
        // Check if user is authorized to resend
        if (invitation.projectId.owner.toString() !== req.user._id.toString()) {
            return res.status(403).json({
                success: false,
                message: 'You are not authorized to resend this invitation'
            });
        }
        
        // Check if invitation is already accepted
        if (invitation.status === 'accepted') {
            return res.status(400).json({
                success: false,
                message: 'This invitation has already been accepted'
            });
        }
        
        // Reset invitation status if it was rejected
        if (invitation.status === 'rejected') {
            invitation.status = 'pending';
            invitation.respondedAt = null;
            await invitation.save();
        }
        
        // Create a new notification
        const inviter = await User.findById(req.user._id).select('name username');
        
        await notificationService.createNotification({
            recipientId: invitation.userId._id,
            type: 'project_invite',
            title: 'Project Invitation Reminder',
            content: `${inviter.name} has sent you a reminder to join project "${invitation.projectId.name}" as ${invitation.role}`,
            senderId: req.user._id,
            entityType: 'project',
            entityId: invitation.projectId._id,
            actionUrl: `/projects/invites`,
            priority: 'high', // Higher priority for reminders
            metaData: {
                invitationId: invitation._id,
                role: invitation.role,
                message: invitation.message || '',
                projectName: invitation.projectId.name,
                isReminder: true
            }
        });
        
        // Return success response
        res.json({
            success: true,
            message: 'Invitation resent successfully',
            invitation
        });
        
    } catch (error) {
        console.error('Resend invitation error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to resend invitation',
            error: error.message
        });
    }
};

export const cancelInvitation = async (req, res) => {
    try {
        const { invitationId } = req.params;
        
        // Find the invitation
        const invitation = await Invitation.findById(invitationId)
            .populate('projectId', 'name description owner')
            .populate('userId', 'name email');
            
        if (!invitation) {
            return res.status(404).json({
                success: false,
                message: 'Invitation not found'
            });
        }
        
        // Check if user is authorized to cancel
        if (invitation.projectId.owner.toString() !== req.user._id.toString()) {
            return res.status(403).json({
                success: false,
                message: 'You are not authorized to cancel this invitation'
            });
        }
        
        // Check if invitation is already accepted
        if (invitation.status === 'accepted') {
            return res.status(400).json({
                success: false,
                message: 'This invitation has already been accepted and cannot be cancelled'
            });
        }
        
        // Delete the invitation
        await Invitation.findByIdAndDelete(invitationId);
        
        // Create a notification about the cancellation
        await notificationService.createNotification({
            recipientId: invitation.userId._id,
            type: 'project_update',
            title: 'Project Invitation Cancelled',
            content: `Your invitation to join project "${invitation.projectId.name}" has been cancelled`,
            senderId: req.user._id,
            entityType: 'project',
            entityId: invitation.projectId._id,
            priority: 'low',
            metaData: {
                projectName: invitation.projectId.name,
                wasCancelled: true
            }
        });
        
        // Return success response
        res.json({
            success: true,
            message: 'Invitation cancelled successfully'
        });
        
    } catch (error) {
        console.error('Cancel invitation error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to cancel invitation',
            error: error.message
        });
    }
};
