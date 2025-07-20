import Team from '../models/Team.js';
import User from '../models/User.js';
import Connection from '../models/Connections.js'; // Adjust based on your actual model name
import { asyncHandler } from '../middleware/asyncHandler.js';
import ErrorResponse from '../utils/errorResponse.js';


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
        path: 'followers following',
        select: 'name email username profilePicture'
      }
    });

    // Get connected user IDs from LinkUps
    const connectedUserIds = user.connections.linkUps.map(conn => {
      return conn.followers._id.toString() === userId.toString()
        ? conn.following._id.toString()
        : conn.followers._id.toString();
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
  })

   if (processedMembers.length > 0) {
    await Promise.all(processedMembers.map(member =>
      User.findByIdAndUpdate(member.user, {
        $push: { team: team._id }
      })
    ));
  }

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

  // Update the team
  if (name) team.name = name.trim();
  if (description !== undefined) team.description = description?.trim();
  if (category) team.category = category.trim();
  if (isPrivate !== undefined) team.isPrivate = isPrivate;
  if (avatar) team.avatar = avatar;
  
  team.updatedAt = Date.now();
  
  await team.save();

  // Return updated team with populated fields
  const updatedTeam = await Team.findById(teamId)
    .populate('owner', 'name email username profilePicture')
    .populate('members.user', 'name email username profilePicture');

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
  const team = await Team.findById(teamId);

  // Check if team exists
  if (!team) {
    return next(new ErrorResponse('Team not found', 404));
  }

  // Check if user is the owner
  if (team.owner.toString() !== userId.toString()) {
    return next(new ErrorResponse('Only the team owner can delete this team', 403));
  }

  await User.updateMany(
    {
        $or: [
            { _id: team.owner },
            { _id: {$in: team.members.map(member => member.user)}}
        ]
    },
    {
        $pull: { team: team._id }
    }   
  )

 
    await Team.findByIdAndDelete(teamId);

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
        { followers: memberId },
        { following: memberId }
      ]
    }
  });

  const isConnected = user.connections.linkUps.some(conn => 
    (conn.followers._id.toString() === memberId) || 
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

  await User.findByIdAndUpdate(memberId, {
    $push: { team: team._id }
  });

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
    (conn.followers._id.toString() === memberId) || 
    (conn.following._id.toString() === memberId)
  );

  if (!isStillConnected) {
    return next(new ErrorResponse('Cannot update role - user is no longer in your LinkUps', 400));
  }

  // Update member role and/or permissions
  if (role) {
    team.members[memberIndex].role = role;
  }
  
  if (permissions) {
    team.members[memberIndex].permissions = permissions;
  }

  team.updatedAt = Date.now();
  await team.save();

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
  await User.findByIdAndUpdate(memberId, {
    $pull: { team: team._id }
  });
  // Remove member
  team.members.splice(memberIndex, 1);
  
  team.updatedAt = Date.now();
  await team.save();

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
  const team = await Team.findById(teamId);

  // Check if team exists
  if (!team) {
    return next(new ErrorResponse('Team not found', 404));
  }

  // Check if user is the owner
  if (team.owner.toString() === userId.toString()) {
    return next(new ErrorResponse('Team owner cannot leave their own team. Transfer ownership or delete the team instead.', 400));
  }

  // Check if user is a member
  const memberIndex = team.members.findIndex(member => 
    member.user.toString() === userId
  );

  if (memberIndex === -1) {
    return next(new ErrorResponse('You are not a member of this team', 404));
  }

  await User.findByIdAndUpdate(userId, {
    $pull: { team: team._id }
  });

  // Remove the member
  team.members.splice(memberIndex, 1);
  
  team.updatedAt = Date.now();
  await team.save();

  res.status(200).json({
    success: true,
    message: 'You have left the team successfully'
  });
});


export const getAvailableConnections = asyncHandler(async (req, res, next) => {
  const { teamId } = req.params;
  const userId = req.user._id; // Note: changed from req.user.id to req.user._id
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
  const user = await User.findById(userId)
    .populate({
      path: 'connections.linkUps',
      populate: {
        path: 'followers following',
        select: 'name email username profilePicture'
      }
    });

  if (!user) {
    return next(new ErrorResponse('User not found', 404));
  }

  // Get all accepted LinkUp connections
  const connections = await Connection.find({
    _id: { $in: user.connections.linkUps },
    status: 'accepted',
    connectionType: 'linkUps'
  })
  .populate('followers following', 'name email username profilePicture');

  // Map and filter connections to get available users
  const availableConnections = connections
    .map(conn => {
      // Determine which user is the connection (not the current user)
      const connectionUser = conn.followers._id.toString() === userId.toString()
        ? conn.following
        : conn.followers;

      return {
        _id: connectionUser._id,
        name: connectionUser.name,
        email: connectionUser.email,
        username: connectionUser.username,
        profilePicture: connectionUser.profilePicture,
        connectionId: conn._id
      };
    })
    // Filter out users who are already team members
    .filter(conn => !currentMemberIds.includes(conn._id.toString()));

  // Apply search filter if provided
  const filteredConnections = searchQuery 
    ? availableConnections.filter(conn => 
        conn.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        conn.username.toLowerCase().includes(searchQuery.toLowerCase()))
    : availableConnections;

  res.status(200).json({
    success: true,
    count: filteredConnections.length,
    data: filteredConnections
  });
});

// Add a new utility function to check connection status
const checkLinkUpConnection = async (userId, targetUserId) => {
  const user = await User.findById(userId).populate({
    path: 'connections.linkUps',
    match: { 
      status: 'accepted',
      connectionType: 'linkUps',
      $or: [
        { followers: targetUserId },
        { following: targetUserId }
      ]
    }
  });

  return user.connections.linkUps.length > 0;
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