import Team from '../models/Team.js';
import User from '../models/User.js';
import Connection from '../models/Connections.js'; // Adjust based on your actual model name
import { asyncHandler } from '../middleware/asyncHandler.js';
import ErrorResponse from '../utils/errorResponse.js';
import notificationService from '../Service/notificationService.js'; // Import notification service

export const createTeam = asyncHandler(async (req, res, next) => {
  const { name, description, category, members = [], isPrivate = false, avatar } = req.body;
  const userId = req.user.id;

  // Validate team name
  if (!name || name.trim().length < 3) {
    return next(new ErrorResponse('Team name must be at least 3 characters', 400));
  }

  // Validate category
  if (!category) {
    return next(new ErrorResponse('Team category is required', 400));
  }

  // Check if the team name already exists for this user
  const existingTeam = await Team.findOne({ name: name.trim(), owner: userId });
  if (existingTeam) {
    return next(new ErrorResponse('You already have a team with this name', 400));
  }

  // Process members - ensure they are valid LinkUp connections
  const processedMembers = [];
  
  if (members.length > 0) {
    // Get all accepted LinkUp connections for the user
    const user = await User.findById(userId).populate({
      path: 'connections.linkUps',
      match: { status: 'accepted', connectionType: 'linkUps' },
      populate: {
        path: 'follower following',
        select: 'name email username profilePicture'
      }
    });

    // Get connected user IDs from LinkUps
    const connectedUserIds = user.connections.linkUps.map(conn => {
      return conn.follower._id.toString() === userId.toString()
        ? conn.following._id.toString()
        : conn.follower._id.toString();
    });

    // Validate that all members are connections
    for (const member of members) {
      if (!member.user || !member.role) continue;

      if (!connectedUserIds.includes(member.user.toString())) {
        return next(new ErrorResponse(`User ${member.user} must be in your LinkUps to add them to a team`, 400));
      }

      processedMembers.push({
        user: member.user,
        role: member.role,
        permissions: member.permissions || []
      });
    }
  }

  // Create the team
  const team = await Team.create({
    name: name.trim(),
    description: description?.trim(),
    category: category.trim(),
    owner: userId,
    members: processedMembers,
    avatar,
    isPrivate
  });

  // Populate the owner and members information
  const populatedTeam = await Team.findById(team._id)
    .populate('owner', 'name email username profilePicture')
    .populate('members.user', 'name email username profilePicture');

  await User.findByIdAndUpdate(userId, {
    $push: { team: team._id}
  });

  // Get the owner's info for notifications
  const teamOwner = await User.findById(userId).select('name');

  if (processedMembers.length > 0) {
    // Process team member updates and send notifications
    const memberUpdatePromises = processedMembers.map(async member => {
      // Add team to user's teams list
      await User.findByIdAndUpdate(member.user, {
        $push: { team: team._id }
      });
      
      // Send notification to the team member
      await notificationService.createNotification({
        recipientId: member.user,
        type: 'team_invite',
        title: 'Added to New Team',
        content: `${teamOwner.name} has added you to their team "${team.name}" as ${member.role}`,
        senderId: userId,
        entityType: 'team',
        entityId: team._id,
        actionUrl: `/teams/${team._id}`,
        priority: 'medium',
        metaData: {
          teamName: team.name,
          teamCategory: team.category,
          role: member.role,
          isPrivate: team.isPrivate
        }
      });
    });
    
    await Promise.all(memberUpdatePromises);
  }

  // Create a welcome notification for the team owner
  await notificationService.createNotification({
    recipientId: userId,
    type: 'system',
    title: 'Team Created Successfully',
    content: `Your new team "${team.name}" has been created with ${processedMembers.length} members`,
    entityType: 'team',
    entityId: team._id,
    actionUrl: `/teams/${team._id}`,
    priority: 'medium',
    metaData: {
      teamName: team.name,
      memberCount: processedMembers.length,
      teamCategory: team.category,
      createdAt: team.createdAt
    }
  });

  res.status(201).json({
    success: true,
    message: 'Team created successfully',
    data: populatedTeam
  });
});


export const getMyTeams = asyncHandler(async (req, res, next) => {
  const userId = req.user.id;
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;
  const skip = (page - 1) * limit;

  // Get teams user owns
  const ownedTeams = await Team.find({ owner: userId })
    .populate('owner', 'name email username profilePicture')
    .populate('members.user', 'name email username profilePicture')
    .skip(skip)
    .limit(limit)
    .sort({ createdAt: -1 });

  // Get teams user is a member of
  const memberTeams = await Team.find({ 'members.user': userId })
    .populate('owner', 'name email username profilePicture')
    .populate('members.user', 'name email username profilePicture')
    .skip(skip)
    .limit(limit)
    .sort({ createdAt: -1 });

  // Get total counts
  const totalOwnedCount = await Team.countDocuments({ owner: userId });
  const totalMemberCount = await Team.countDocuments({ 'members.user': userId });

  res.status(200).json({
    success: true,
    ownedTeams: {
      count: totalOwnedCount,
      data: ownedTeams,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalOwnedCount / limit)
      }
    },
    memberTeams: {
      count: totalMemberCount,
      data: memberTeams,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalMemberCount / limit)
      }
    }
  });
});


export const getTeam = asyncHandler(async (req, res, next) => {
  const { teamId } = req.params;
  const userId = req.user.id;

  // Find team and check if user has access
  const team = await Team.findById(teamId)
    .populate('owner', 'name email username profilePicture')
    .populate('members.user', 'name email username profilePicture');

  if (!team) {
    return next(new ErrorResponse('Team not found', 404));
  }

  // Check if user has access (owner or member)
  const isOwner = team.owner._id.toString() === userId.toString();
  const isMember = team.members.some(member => member.user._id.toString() === userId.toString());

  if (!isOwner && !isMember && team.isPrivate) {
    return next(new ErrorResponse('Access denied to this team', 403));
  }

  res.status(200).json({
    success: true,
    data: team
  });
});


export const updateTeam = asyncHandler(async (req, res, next) => {
  const { teamId } = req.params;
  const userId = req.user.id;
  const { name, description, category, isPrivate, avatar } = req.body;

  // Find the team
  const team = await Team.findById(teamId);

  // Check if team exists
  if (!team) {
    return next(new ErrorResponse('Team not found', 404));
  }

  // Check if user is the owner
  if (team.owner.toString() !== userId.toString()) {
    return next(new ErrorResponse('Only the team owner can update team details', 403));
  }

  // Store original values for change detection
  const originalName = team.name;
  const originalPrivacy = team.isPrivate;
  const originalCategory = team.category;
  
  // Track what fields changed
  const changedFields = [];
  
  // Update the team
  if (name && name.trim() !== team.name) {
    team.name = name.trim();
    changedFields.push('name');
  }
  
  if (description !== undefined && description?.trim() !== team.description) {
    team.description = description?.trim();
    changedFields.push('description');
  }
  
  if (category && category.trim() !== team.category) {
    team.category = category.trim();
    changedFields.push('category');
  }
  
  if (isPrivate !== undefined && isPrivate !== team.isPrivate) {
    team.isPrivate = isPrivate;
    changedFields.push('privacy');
  }
  
  if (avatar && avatar !== team.avatar) {
    team.avatar = avatar;
    changedFields.push('avatar');
  }
  
  team.updatedAt = Date.now();
  
  await team.save();

  // Return updated team with populated fields
  const updatedTeam = await Team.findById(teamId)
    .populate('owner', 'name email username profilePicture')
    .populate('members.user', 'name email username profilePicture');

  // If significant changes were made, notify team members
  if (changedFields.length > 0) {
    // Get team owner info
    const owner = await User.findById(userId).select('name');
    
    // Generate notification message based on changes
    let notificationTitle = 'Team Updated';
    let notificationContent = `${owner.name} has updated team "${originalName}"`;
    
    if (changedFields.length === 1) {
      if (changedFields[0] === 'name') {
        notificationTitle = 'Team Name Changed';
        notificationContent = `${owner.name} has renamed team "${originalName}" to "${team.name}"`;
      } else if (changedFields[0] === 'privacy') {
        notificationTitle = 'Team Privacy Changed';
        notificationContent = `${owner.name} has changed team "${team.name}" to ${team.isPrivate ? 'private' : 'public'}`;
      }
    }
    
    // Send notifications to all team members
    const notificationPromises = team.members.map(member => 
      notificationService.createNotification({
        recipientId: member.user._id,
        type: 'team_update',
        title: notificationTitle,
        content: notificationContent,
        senderId: userId,
        entityType: 'team',
        entityId: team._id,
        actionUrl: `/teams/${team._id}`,
        priority: 'low',
        metaData: {
          teamName: team.name,
          originalName: originalName,
          changedFields: changedFields,
          updatedAt: new Date()
        }
      })
    );
    
    await Promise.all(notificationPromises);
  }

  res.status(200).json({
    success: true,
    message: 'Team updated successfully',
    data: updatedTeam
  });
});


export const deleteTeam = asyncHandler(async (req, res, next) => {
  const { teamId } = req.params;
  const userId = req.user.id;

  // Find the team
  const team = await Team.findById(teamId)
    .populate('members.user', 'name');

  // Check if team exists
  if (!team) {
    return next(new ErrorResponse('Team not found', 404));
  }

  // Check if user is the owner
  if (team.owner.toString() !== userId.toString()) {
    return next(new ErrorResponse('Only the team owner can delete this team', 403));
  }

  // Get team owner info
  const owner = await User.findById(userId).select('name');
  
  // Notify all team members about the deletion
  const memberIds = team.members.map(member => member.user._id);
  const teamName = team.name;
  
  const notificationPromises = memberIds.map(memberId => 
    notificationService.createNotification({
      recipientId: memberId,
      type: 'team_update',
      title: 'Team Disbanded',
      content: `${owner.name} has disbanded the team "${teamName}"`,
      senderId: userId,
      entityType: 'user',
      entityId: userId,
      priority: 'high',
      metaData: {
        teamName: teamName,
        teamCategory: team.category,
        disbandedAt: new Date()
      }
    })
  );
  
  // Remove team from all users' team list
  await User.updateMany(
    {
      $or: [
        { _id: team.owner },
        { _id: { $in: team.members.map(member => member.user) } }
      ]
    },
    {
      $pull: { team: team._id }
    }   
  );

  // Delete the team
  await Team.findByIdAndDelete(teamId);
  
  // Send notifications after team is deleted
  await Promise.all(notificationPromises);

  res.status(200).json({
    success: true,
    message: 'Team deleted successfully'
  });
});

 
export const addTeamMember = asyncHandler(async (req, res, next) => {
  const { teamId } = req.params;
  const userId = req.user.id;
  const { memberId, role, permissions = [] } = req.body;

  // Validate input
  if (!memberId) {
    return next(new ErrorResponse('Member ID is required', 400));
  }
  
  if (!role) {
    return next(new ErrorResponse('Role is required', 400));
  }

  // Find the team
  const team = await Team.findById(teamId);

  // Check if team exists
  if (!team) {
    return next(new ErrorResponse('Team not found', 404));
  }

  // Check if user is the owner
  if (team.owner.toString() !== userId.toString()) {
    return next(new ErrorResponse('Only the team owner can add members', 403));
  }

  // Check if member is already in the team
  if (team.members.some(member => member.user.toString() === memberId)) {
    return next(new ErrorResponse('This user is already a team member', 400));
  }

  // Check if member is a LinkUp connection
  const user = await User.findById(userId).populate({
    path: 'connections.linkUps',
    match: { 
      status: 'accepted',
      connectionType: 'linkUps',
      $or: [
        { follower: memberId },
        { following: memberId }
      ]
    }
  });

  const isConnected = user.connections.linkUps.some(conn => 
    (conn.follower._id.toString() === memberId) || 
    (conn.following._id.toString() === memberId)
  );

  if (!isConnected) {
    return next(new ErrorResponse('You can only add your LinkUp connections as team members', 400));
  }

  // Add member to team
  team.members.push({
    user: memberId,
    role,
    permissions,
    joinedAt: Date.now()
  });

  team.updatedAt = Date.now();
  await team.save();

  // Add team to user's teams
  await User.findByIdAndUpdate(memberId, {
    $push: { team: team._id }
  });

  // Get information for notification
  const teamOwner = await User.findById(userId).select('name');
  const newMember = await User.findById(memberId).select('name');

  // Send notification to the new member
  await notificationService.createNotification({
    recipientId: memberId,
    type: 'team_invite',
    title: 'Added to Team',
    content: `${teamOwner.name} has added you to team "${team.name}" as ${role}`,
    senderId: userId,
    entityType: 'team',
    entityId: teamId,
    actionUrl: `/teams/${teamId}`,
    priority: 'medium',
    metaData: {
      teamName: team.name,
      teamCategory: team.category,
      role: role,
      permissions: permissions
    }
  });
  
  // Notify existing team members about the new addition
  if (team.members.length > 1) {
    const existingMemberPromises = team.members
      .filter(member => member.user.toString() !== memberId) // Exclude the new member
      .map(member => 
        notificationService.createNotification({
          recipientId: member.user,
          type: 'team_update',
          title: 'New Team Member',
          content: `${teamOwner.name} has added ${newMember.name} to team "${team.name}"`,
          senderId: userId,
          entityType: 'team',
          entityId: teamId,
          actionUrl: `/teams/${teamId}/members`,
          priority: 'low',
          metaData: {
            teamName: team.name,
            newMemberId: memberId,
            newMemberRole: role,
            addedAt: new Date()
          }
        })
      );
    
    await Promise.all(existingMemberPromises);
  }

  // Return updated team with populated fields
  const updatedTeam = await Team.findById(teamId)
    .populate('owner', 'name email username profilePicture')
    .populate('members.user', 'name email username profilePicture');

  res.status(200).json({
    success: true,
    message: 'Member added successfully',
    data: updatedTeam
  });
});


export const updateTeamMember = asyncHandler(async (req, res, next) => {
  const { teamId, memberId } = req.params;
  const userId = req.user.id;
  const { role, permissions } = req.body;

  // Find the team
  const team = await Team.findById(teamId);

  // Check if team exists
  if (!team) {
    return next(new ErrorResponse('Team not found', 404));
  }

  // Check if user is the owner
  if (team.owner.toString() !== userId.toString()) {
    return next(new ErrorResponse('Only the team owner can update member roles', 403));
  }

  // Find the member in the team
  const memberIndex = team.members.findIndex(member => 
    member.user.toString() === memberId
  );

  if (memberIndex === -1) {
    return next(new ErrorResponse('Member not found in this team', 404));
  }

  // Additional check to ensure the member is still a connection
  const user = await User.findById(userId).populate({
    path: 'connections.linkUps',
    match: { 
      status: 'accepted',
      connectionType: 'linkUps'
    }
  });

  const isStillConnected = user.connections.linkUps.some(conn => 
    (conn.follower._id.toString() === memberId) || 
    (conn.following._id.toString() === memberId)
  );

  if (!isStillConnected) {
    return next(new ErrorResponse('Cannot update role - user is no longer in your LinkUps', 400));
  }

  // Track what's changing for notification
  const changedFields = [];
  const previousRole = team.members[memberIndex].role;
  const previousPermissions = [...team.members[memberIndex].permissions];
  
  // Update member role and/or permissions
  if (role && role !== previousRole) {
    team.members[memberIndex].role = role;
    changedFields.push('role');
  }
  
  if (permissions && JSON.stringify(permissions) !== JSON.stringify(previousPermissions)) {
    team.members[memberIndex].permissions = permissions;
    changedFields.push('permissions');
  }

  team.updatedAt = Date.now();
  await team.save();

  // If role or permissions changed, notify the member
  if (changedFields.length > 0) {
    // Get team owner info
    const owner = await User.findById(userId).select('name');
    
    // Generate notification message based on what changed
    let notificationTitle = 'Team Role Updated';
    let notificationContent = `${owner.name} updated your role in team "${team.name}"`;
    
    if (changedFields.includes('role') && !changedFields.includes('permissions')) {
      notificationContent = `${owner.name} changed your role in team "${team.name}" from ${previousRole} to ${role}`;
    }
    
    // Send notification to the updated member
    await notificationService.createNotification({
      recipientId: memberId,
      type: 'team_role_change',
      title: notificationTitle,
      content: notificationContent,
      senderId: userId,
      entityType: 'team',
      entityId: teamId,
      actionUrl: `/teams/${teamId}`,
      priority: role === 'admin' ? 'high' : 'medium',
      metaData: {
        teamName: team.name,
        previousRole: previousRole,
        newRole: role || previousRole,
        changedFields: changedFields,
        updatedAt: new Date()
      }
    });
  }

  // Return updated team with populated fields
  const updatedTeam = await Team.findById(teamId)
    .populate('owner', 'name email username profilePicture')
    .populate('members.user', 'name email username profilePicture');

  res.status(200).json({
    success: true,
    message: 'Member updated successfully',
    data: updatedTeam
  });
});


export const removeTeamMember = asyncHandler(async (req, res, next) => {
  const { teamId, memberId } = req.params;
  const userId = req.user.id;

  // Find the team
  const team = await Team.findById(teamId);

  // Check if team exists
  if (!team) {
    return next(new ErrorResponse('Team not found', 404));
  }

  // Check if user is the owner
  if (team.owner.toString() !== userId.toString()) {
    return next(new ErrorResponse('Only the team owner can remove members', 403));
  }

  // Check if member exists in team
  const memberIndex = team.members.findIndex(member => 
    member.user.toString() === memberId
  );

  if (memberIndex === -1) {
    return next(new ErrorResponse('Member not found in this team', 404));
  }

  // Get member info before removal for notification
  const removedMemberRole = team.members[memberIndex].role;
  
  // Get user objects for notifications
  const teamOwner = await User.findById(userId).select('name');
  const removedMember = await User.findById(memberId).select('name');
  
  // Remove team from user's team list
  await User.findByIdAndUpdate(memberId, {
    $pull: { team: team._id }
  });
  
  // Remove member
  team.members.splice(memberIndex, 1);
  
  team.updatedAt = Date.now();
  await team.save();

  // Notify the removed member
  await notificationService.createNotification({
    recipientId: memberId,
    type: 'team_update',
    title: 'Removed from Team',
    content: `${teamOwner.name} has removed you from team "${team.name}"`,
    senderId: userId,
    entityType: 'team',
    entityId: teamId,
    priority: 'high',
    metaData: {
      teamName: team.name,
      previousRole: removedMemberRole,
      removedAt: new Date()
    }
  });
  
  // Notify other team members about the removal
  const notificationPromises = team.members.map(member => 
    notificationService.createNotification({
      recipientId: member.user,
      type: 'team_update',
      title: 'Team Member Removed',
      content: `${teamOwner.name} has removed ${removedMember.name} from team "${team.name}"`,
      senderId: userId,
      entityType: 'team',
      entityId: teamId,
      actionUrl: `/teams/${teamId}/members`,
      priority: 'low',
      metaData: {
        teamName: team.name,
        removedMemberId: memberId,
        removedMemberName: removedMember.name,
        removedAt: new Date()
      }
    })
  );
  
  await Promise.all(notificationPromises);

  // Return updated team with populated fields
  const updatedTeam = await Team.findById(teamId)
    .populate('owner', 'name email username profilePicture')
    .populate('members.user', 'name email username profilePicture');

  res.status(200).json({
    success: true,
    message: 'Member removed successfully',
    data: updatedTeam
  });
});


export const leaveTeam = asyncHandler(async (req, res, next) => {
  const { teamId } = req.params;
  const userId = req.user.id;

  // Find the team
  const team = await Team.findById(teamId)
    .populate('owner', 'name');
    
  // Check if team exists
  if (!team) {
    return next(new ErrorResponse('Team not found', 404));
  }

  // Check if user is the owner
  if (team.owner._id.toString() === userId.toString()) {
    return next(new ErrorResponse('Team owner cannot leave their own team. Transfer ownership or delete the team instead.', 400));
  }

  // Check if user is a member
  const memberIndex = team.members.findIndex(member => 
    member.user.toString() === userId
  );

  if (memberIndex === -1) {
    return next(new ErrorResponse('You are not a member of this team', 404));
  }

  // Get member info before leaving
  const memberRole = team.members[memberIndex].role;
  const member = await User.findById(userId).select('name');
  
  // Remove team from user's team list
  await User.findByIdAndUpdate(userId, {
    $pull: { team: team._id }
  });

  // Remove the member
  team.members.splice(memberIndex, 1);
  
  team.updatedAt = Date.now();
  await team.save();

  // Notify the team owner that a member has left
  await notificationService.createNotification({
    recipientId: team.owner._id,
    type: 'team_update',
    title: 'Team Member Left',
    content: `${member.name} has left your team "${team.name}"`,
    senderId: userId,
    entityType: 'team',
    entityId: teamId,
    actionUrl: `/teams/${teamId}/members`,
    priority: memberRole === 'admin' ? 'high' : 'medium',
    metaData: {
      teamName: team.name,
      memberRole: memberRole,
      leftAt: new Date()
    }
  });
  
  // Notify other team members about someone leaving
  if (team.members.length > 0) {
    const notificationPromises = team.members.map(m => 
      notificationService.createNotification({
        recipientId: m.user,
        type: 'team_update',
        title: 'Team Member Left',
        content: `${member.name} has left team "${team.name}"`,
        senderId: userId,
        entityType: 'team',
        entityId: teamId,
        actionUrl: `/teams/${teamId}/members`,
        priority: 'low',
        metaData: {
          teamName: team.name,
          memberId: userId,
          memberName: member.name,
          leftAt: new Date()
        }
      })
    );
    
    await Promise.all(notificationPromises);
  }

  res.status(200).json({
    success: true,
    message: 'You have left the team successfully'
  });
});


export const getAvailableConnections = asyncHandler(async (req, res, next) => {
  const { teamId } = req.params;
  const userId = req.user._id;
  const searchQuery = req.query.search || '';
  
  // Find the team with populated members
  const team = await Team.findById(teamId)
    .populate('members.user', 'name email username profilePicture');

  if (!team) {
    return next(new ErrorResponse('Team not found', 404));
  }

  // Check if user is the owner
  if (team.owner.toString() !== userId.toString()) {
    return next(new ErrorResponse('Only the team owner can access this resource', 403));
  }

  // Get current team member IDs including owner
  const currentMemberIds = [
    team.owner.toString(),
    ...team.members.map(member => member.user._id.toString())
  ];

  // Get the user with their LinkUps
  const user = await User.findById(userId);

  if (!user) {
    return next(new ErrorResponse('User not found', 404));
  }

  // Check if user has any linkUps
  if (!user.connections || !user.connections.linkUps || user.connections.linkUps.length === 0) {
    return res.status(200).json({
      success: true,
      count: 0,
      data: []
    });
  }

  // Get all LinkUp connections for this user
  const connections = await Connection.find({
    _id: { $in: user.connections.linkUps },
    status: 'accepted',
    connectionType: 'linkUps'
  });
  
  console.log("Found Connection Documents:", connections.length);
  
  // Since the follower/following fields are empty, we'll need to look for connected users differently
  // We'll use all other available users that have a connection with this user
  
  // First get all users with accepted linkUp connections
  const connectedUsers = await User.find({
    'connections.linkUps': { $in: user.connections.linkUps },
    _id: { $ne: userId }  // Exclude current user
  })
  .select('name email username profilePicture')
  .lean();
  
  console.log("Found Connected Users:", connectedUsers.length);
  
  // Add connection IDs to each user
  const enrichedUsers = connectedUsers.map(connectedUser => {
    // Find the connection that links these users
    const connection = connections.find(conn => 
      user.connections.linkUps.some(linkUpId => 
        linkUpId.toString() === conn._id.toString()
      )
    );
    
    return {
      ...connectedUser,
      connectionId: connection ? connection._id : null
    };
  });
  
  // Filter out users who are already team members
  const filteredByMembership = enrichedUsers.filter(user => 
    !currentMemberIds.includes(user._id.toString())
  );

  // Apply search filter if provided
  const filteredConnections = searchQuery 
    ? filteredByMembership.filter(user => 
        user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (user.username && user.username.toLowerCase().includes(searchQuery.toLowerCase()))
      )
    : filteredByMembership;

  res.status(200).json({
    success: true,
    count: filteredConnections.length,
    data: filteredConnections
  });
});

// Add a new utility function to check connection status
const checkLinkUpConnection = async (userId, targetUserId) => {
  // Get both users
  const user1 = await User.findById(userId);
  const user2 = await User.findById(targetUserId);
  
  if (!user1 || !user2 || !user1.connections || !user2.connections) {
    return false;
  }
  
  // Check if they share any linkUp connection IDs
  const user1LinkUps = user1.connections.linkUps.map(id => id.toString());
  const user2LinkUps = user2.connections.linkUps.map(id => id.toString());
  
  // Find common linkUp connections
  const commonLinkUps = user1LinkUps.filter(id => user2LinkUps.includes(id));
  
  return commonLinkUps.length > 0;
};


// Add a new function to get team statistics
export const getTeamStats = asyncHandler(async (req, res, next) => {
  const { teamId } = req.params;
  const userId = req.user._id;

  const team = await Team.findById(teamId);

  if (!team) {
    return next(new ErrorResponse('Team not found', 404));
  }

  if (team.owner.toString() !== userId.toString()) {
    return next(new ErrorResponse('Only team owner can view detailed stats', 403));
  }

  const stats = {
    totalMembers: team.members.length,
    roleDistribution: {},
    membershipDuration: {
      lessThanMonth: 0,
      oneToThreeMonths: 0,
      threeToSixMonths: 0,
      overSixMonths: 0
    }
  };

  // Calculate role distribution and membership duration
  team.members.forEach(member => {
    // Role distribution
    stats.roleDistribution[member.role] = (stats.roleDistribution[member.role] || 0) + 1;

    // Membership duration
    const duration = Date.now() - member.joinedAt;
    const monthsAsMember = duration / (1000 * 60 * 60 * 24 * 30);

    if (monthsAsMember < 1) stats.membershipDuration.lessThanMonth++;
    else if (monthsAsMember < 3) stats.membershipDuration.oneToThreeMonths++;
    else if (monthsAsMember < 6) stats.membershipDuration.threeToSixMonths++;
    else stats.membershipDuration.overSixMonths++;
  });

  res.status(200).json({
    success: true,
    data: stats
  });
});

// Export all controllers
export default {
  createTeam,
  getMyTeams,
  getTeam,
  updateTeam,
  deleteTeam,
  addTeamMember,
  updateTeamMember,
  removeTeamMember,
  leaveTeam,
  getAvailableConnections,
  getTeamStats
};