import Connection from '../models/Connections.js';
import User from '../models/User.js';
import mongoose from 'mongoose';
import notificationService from '../Service/notificationService.js';

/**
 * Send a LinkUp request to another user
 * @route POST /api/connections/linkup
 */
export const sendLinkUpRequest = async (req, res) => {
  try {
    const { userId, message } = req.body;
    const currentUserId = req.user?._id;
    
    // Basic validation
    if (!currentUserId) {
      return res.status(401).json({ message: "Authentication required. Please log in." });
    }
    
    if (!userId) {
      return res.status(400).json({ message: "Target user ID is required" });
    }
    
    if (currentUserId.toString() === userId) {
      return res.status(400).json({ message: "You cannot link up with yourself" });
    }

    console.log(`Checking existing connection between ${currentUserId} and ${userId}`);

    // Ensure field names match your schema and index
    const existingConnection = await Connection.findOne({
      $or: [
        // Use either follower/following (singular) OR followers/following (plural)
        // based on what you decide in your schema
        { follower: currentUserId, following: userId },  // If using singular
        { follower: userId, following: currentUserId }   // If using singular
        
        // OR if you updated the index to use the plural form:
        // { followers: currentUserId, following: userId },
        // { followers: userId, following: currentUserId }
      ],
      connectionType: 'linkUps'
    });
    
    if (existingConnection) {
      console.log("Found existing connection:", existingConnection);
      // Return appropriate message based on connection status
      if (existingConnection.status === 'pending') {
        return res.status(400).json({ message: "A connection request already exists between you and this user" });
      } else if (existingConnection.status === 'accepted') {
        return res.status(400).json({ message: "You're already connected with this user" });
      } else {
        return res.status(400).json({ message: "A connection already exists with this user" });
      }
    }
    
    // Create new connection with field names matching the schema
    const connection = new Connection({
      // Use field names that match your schema and index
      follower: currentUserId,  // If using singular
      following: userId,
      connectionType: 'linkUps',
      status: 'pending',
      requestedAt: new Date(),
      message: message || ''
    });

    console.log("Creating new connection:", connection);

    await connection.save();
    
    // Update users' pending lists
    await User.findByIdAndUpdate(currentUserId, {
      $push: { 
        'connections.pending.sent': {
          connection: connection._id,
          requestedAt: new Date()
        }
      }
    });
    
    await User.findByIdAndUpdate(userId, {
      $push: { 
        'connections.pending.received': {
          connection: connection._id,
          requestedAt: new Date()
        }
      }
    });

    // Keep notification service
    await notificationService.sendConnectionRequest(
      currentUserId,
      userId,
      message || ''
    );
    
    return res.status(200).json({ 
      message: "LinkUp request sent",
      connection: {
        _id: connection._id,
        status: connection.status,
        requestedAt: connection.requestedAt
      }
    });
    
  } catch (error) {
    console.error("Error sending LinkUp request:", error);
    
    if (error.code === 11000) {
      return res.status(400).json({ 
        message: "A connection request already exists with this user",
        error: error.message
      });
    }
    
    return res.status(500).json({ message: "Server error", error: error.message });
  }
};

/**
 * Accept a LinkUp request
 * @route PUT /api/connections/linkup/accept/:connectionId
 */
export const acceptLinkUpRequest = async (req, res) => {
  try {
    const { connectionId } = req.params;
    const currentUserId = req.user._id;
    
    const connection = await Connection.findById(connectionId);
    if (!connection) {
      return res.status(404).json({ message: "LinkUp request not found" });
    }
    
    // Ensure this request is meant for the current user
    if (connection.following.toString() !== currentUserId.toString()) {
      return res.status(403).json({ message: "You are not authorized to accept this request" });
    }
    
    if (connection.status !== 'pending') {
      return res.status(400).json({ message: `This request is already ${connection.status}` });
    }
    
    // Update connection status
    connection.status = 'accepted';
    connection.acceptedAt = new Date();
    await connection.save();
    
    // Remove from pending lists - update 'followers' to 'follower'
    await User.findByIdAndUpdate(connection.follower, {
      $pull: { 'connections.pending.sent': { connection: connectionId } }
    });
    
    await User.findByIdAndUpdate(currentUserId, {
      $pull: { 'connections.pending.received': { connection: connectionId } }
    });
    
    // Add to LinkUp lists for both users
    await User.findByIdAndUpdate(currentUserId, {
      $push: { 'connections.linkUps': connection._id }
    });
    
    await User.findByIdAndUpdate(connection.follower, {
      $push: { 'connections.linkUps': connection._id }
    });
    
    // Create notification for the requester
    const currentUser = await User.findById(currentUserId).select('name username profilePicture');

      await notificationService.createNotification({
      recipientId: connection.follower,
      type: 'connection_accepted',
      title: 'Connection Request Accepted',
      content: `${currentUser.name} accepted your connection request`,
      senderId: currentUserId,
      entityType: 'user',
      entityId: currentUserId,
      actionUrl: `/profile/${currentUserId}`,
      metaData: { connectionId: connection._id }
    });
    
    
    return res.status(200).json({ 
      message: "LinkUp request accepted",
      connection 
    });
  } catch (error) {
    console.error("Error accepting LinkUp request:", error);
    return res.status(500).json({ message: "Server error", error: error.message });
  }
};

/**
 * Reject a LinkUp request
 * @route PUT /api/connections/linkup/reject/:connectionId
 */
export const rejectLinkUpRequest = async (req, res) => {
  try {
    const { connectionId } = req.params;
    const currentUserId = req.user._id;
    
    const connection = await Connection.findById(connectionId);
    if (!connection) {
      return res.status(404).json({ message: "LinkUp request not found" });
    }
    
    // Ensure this request is meant for the current user
    if (connection.following.toString() !== currentUserId.toString()) {
      return res.status(403).json({ message: "You are not authorized to reject this request" });
    }
    
    if (connection.status !== 'pending') {
      return res.status(400).json({ message: `This request is already ${connection.status}` });
    }
    
    // Update connection status
    connection.status = 'declined';
    await connection.save();
    
    // Remove from pending lists
    await User.findByIdAndUpdate(connection.follower, {
      $pull: { 'connections.pending.sent': { connection: connectionId } }
    });
    
    await User.findByIdAndUpdate(currentUserId, {
      $pull: { 'connections.pending.received': { connection: connectionId } }
    });
    
    return res.status(200).json({ 
      message: "LinkUp request rejected",
      connection 
    });
  } catch (error) {
    console.error("Error rejecting LinkUp request:", error);
    return res.status(500).json({ message: "Server error", error: error.message });
  }
};

/**
 * Remove a LinkUp connection
 * @route DELETE /api/connections/linkup/:userId
 */
export const removeLinkUp = async (req, res) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.user._id;
    
    // Find the connection - update query to use 'follower' instead of 'followers'
    const connection = await Connection.findOne({
      $or: [
        { follower: currentUserId, following: userId },
        { follower: userId, following: currentUserId }
      ],
      connectionType: 'linkUps',
      status: 'accepted'
    });
    
    if (!connection) {
      return res.status(404).json({ message: "LinkUp connection not found" });
    }
    
    // Delete the connection
    await Connection.findByIdAndDelete(connection._id);
    
    // Remove from linkUps lists for both users
    await User.findByIdAndUpdate(connection.follower, {
      $pull: { 'connections.linkUps': connection._id }
    });
    
    await User.findByIdAndUpdate(connection.following, {
      $pull: { 'connections.linkUps': connection._id }
    });
    
    return res.status(200).json({ 
      message: "LinkUp removed successfully"
    });
  } catch (error) {
    console.error("Error removing LinkUp:", error);
    return res.status(500).json({ message: "Server error", error: error.message });
  }
};

/**
 * Get all LinkUps for the current user - Simplified version
 * @route GET /api/connections/linkups
 */
export const getLinkUps = async (req, res) => {
  try {
    const currentUserId = req.user._id;
    
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    
    // First get the user's linkUp connection IDs
    const user = await User.findById(currentUserId)
      .select('connections.linkUps');

    if (!user?.connections?.linkUps?.length) {
      return res.status(200).json({
        linkUps: [],
        count: 0,
        currentPage: page,
        totalPages: 0
      });
    }

    // Get the connection documents directly
    const connections = await Connection.find({
      _id: { $in: user.connections.linkUps },
      connectionType: 'linkUps',
      status: 'accepted'
    })
    .populate('follower following', 'name username profilePicture bio profession')
    .skip(skip)
    .limit(limit);
    
    // Format the linkUps data
    const linkUps = connections
      .map(connection => {
        // Determine which user to return (the one that's not the current user)
        const isFollower = connection.follower?._id?.toString() === currentUserId.toString();
        const otherUser = isFollower ? connection.following : connection.follower;
        
        if (!otherUser?._id) return null;
        
        return {
          connectionId: connection._id,
          user: {
            _id: otherUser._id,
            name: otherUser.name || 'Unknown User',
            username: otherUser.username,
            profilePicture: otherUser.profilePicture,
            bio: otherUser.bio,
            profession: otherUser.profession
          },
          since: connection.acceptedAt || connection.createdAt
        };
      })
      .filter(Boolean); // Remove any null entries

    // Get the total count of connections
    const totalCount = user.connections.linkUps.length;
    
    return res.status(200).json({
      linkUps,
      count: totalCount,
      currentPage: page,
      totalPages: Math.ceil(totalCount / limit)
    });
  } catch (error) {
    console.error("Error getting LinkUps:", error);
    return res.status(500).json({ 
      message: "Failed to fetch LinkUps", 
      error: error.message 
    });
  }
};

/**
 * Simplified version of getting pending requests
 */
export const getPendingLinkUps = async (req, res) => {
  try {
    const currentUserId = req.user._id;
    
    // Get user's connection request IDs
    const user = await User.findById(currentUserId)
      .select('connections.pending.received connections.pending.sent');
    
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    
    // Get received requests - fetch all at once
    const receivedRequestIds = user.connections.pending.received.map(item => item.connection);
    const receivedConnections = await Connection.find({
      _id: { $in: receivedRequestIds },
      status: 'pending'
    }).populate('follower', 'name username profilePicture bio profession');
    
    const receivedRequests = receivedConnections.map(connection => ({
      connectionId: connection._id,
      user: connection.follower,
      message: connection.message,
      requestedAt: connection.requestedAt
    }));
    
    // Get sent requests - fetch all at once
    const sentRequestIds = user.connections.pending.sent.map(item => item.connection);
    const sentConnections = await Connection.find({
      _id: { $in: sentRequestIds },
      status: 'pending'
    }).populate('following', 'name username profilePicture bio profession');
    
    const sentRequests = sentConnections.map(connection => ({
      connectionId: connection._id,
      user: connection.following,
      message: connection.message,
      requestedAt: connection.requestedAt
    }));
    
    return res.status(200).json({
      received: receivedRequests,
      sent: sentRequests
    });
  } catch (error) {
    console.error("Error getting pending LinkUps:", error);
    return res.status(500).json({ message: "Server error", error: error.message });
  }
};

/**
 * Get the LinkUp count for a user
 * @route GET /api/connections/linkup/count/:userId?
 */
export const getLinkUpCount = async (req, res) => {
  try {
    const { userId } = req.params;
    const targetUserId = userId || req.user._id;
    
    const user = await User.findById(targetUserId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    
    return res.status(200).json({
      count: user.connections.linkUps.length
    });
  } catch (error) {
    console.error("Error getting LinkUp count:", error);
    return res.status(500).json({ message: "Server error", error: error.message });
  }
};

/**
 * Check LinkUp status with another user
 * @route GET /api/connections/linkup/status/:userId
 */
export const checkLinkUpStatus = async (req, res) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.user._id;
    
    // Validate user ID
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: "Invalid user ID" });
    }
    
    // Ensure valid user
    const targetUser = await User.findById(userId);
    if (!targetUser) {
      return res.status(404).json({ message: "User not found" });
    }
    
    // Check for any connection between the users
    const connection = await Connection.findOne({
      $or: [
        { follower: currentUserId, following: userId },
        { follower: userId, following: currentUserId }
      ],
      connectionType: 'linkUps'
    });
    
    if (!connection) {
      return res.status(200).json({ status: 'none' });
    }
    
    let status;
    if (connection.status === 'pending') {
      // Check if current user is the requester or recipient
      if (connection.follower.toString() === currentUserId.toString()) {
        status = 'request_sent';
      } else {
        status = 'request_received';
      }
    } else {
      status = connection.status; // 'accepted' or 'declined'
    }
    
    return res.status(200).json({
      status,
      connectionId: connection._id,
      requestedAt: connection.requestedAt,
      acceptedAt: connection.acceptedAt,
      message: connection.message
    });
  } catch (error) {
    console.error("Error checking LinkUp status:", error);
    return res.status(500).json({ message: "Server error", error: error.message });
  }
};

/**
 * Get a user's profile with appropriate privacy controls
 * @route GET /api/users/profile/:userId
 */
export const getUserProfile = async (req, res) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.user._id;
    
    // Validate the user ID
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: "Invalid user ID" });
    }
    
    // Find the user but exclude sensitive information
    const user = await User.findById(userId)
      .select('-password -refreshToken -__v')
      .populate({
        path: 'connections.linkUps',
        select: '_id followers following',
        options: { limit: 5 }
      });
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Check connection status between users
    const connection = await Connection.findOne({
      $or: [
        { follower: currentUserId, following: userId },
        { follower: userId, following: currentUserId }
      ],
      connectionType: 'linkUps'
    });
    
    // Determine connection status
    let connectionStatus = 'none';
    let connectionId = null;
    
    if (connection) {
      connectionId = connection._id;
      
      if (connection.status === 'pending') {
        // Check if current user is the requester or recipient
        connectionStatus = connection.follower.toString() === currentUserId.toString() 
          ? 'request_sent' 
          : 'request_received';
      } else {
        connectionStatus = connection.status; // 'accepted' or 'declined'
      }
    }
    
    // Check visibility settings to determine what to expose
    const isOwner = currentUserId.toString() === userId;
    const isConnected = connectionStatus === 'accepted';
    const isBlocked = user.connections.blocked.some(id => 
      id.toString() === currentUserId.toString()
    );
    
    // If blocked, return minimal info
    if (isBlocked && !isOwner) {
      return res.status(403).json({
        message: 'You cannot view this profile',
        restricted: true
      });
    }
    
    // Apply privacy filters based on settings
    let profileData = {
      _id: user._id,
      name: user.name,
      username: user.username,
      email: user.email,
      profilePicture: user.profilePicture,
      createdAt: user.createdAt,
      online: user.online,
      lastActive: user.lastActive
    };
    
    // Handle visibility settings for detailed profile data
    if (isOwner || isConnected || user.connectionSettings.visibility.profile === 'public') {
      // Full profile access
      profileData = {
    ...profileData,
    bio: user.bio,
    profession: user.profession,
    skills: user.skills || [],          // Include skills array
    interests: user.interests || [],    // Include interests array
    location: user.location,
    website: user.website,
    coverImage: user.coverImage,
    connectionStats: {
      linkUpsCount: user.connections.linkUps.length,
      followersCount: user.connections.followers.length,
      followingCount: user.connections.following.length
    }
      };
      
      // Only add activity data if appropriate visibility
      if (isOwner || 
         (isConnected && user.connectionSettings.visibility.activity !== 'private') || 
         user.connectionSettings.visibility.activity === 'public') {
        
        // Get recent activities (projects, posts, etc.)
        // This would be specific to your application's activity model
        // Example: const recentActivity = await Activity.find({user: userId}).limit(5);
        
        profileData.recentActivity = []; // Populate with actual activity data
      }
    } else {
      // Limited profile for non-connections when profile is not public
      profileData = {
        _id: user._id,
        name: user.name,
        username: user.username,
        profilePicture: user.profilePicture,
        restricted: true
      };
    }
    
    // Add connection information
    const connectionInfo = {
      status: connectionStatus,
      connectionId: connectionId,
      canConnect: isOwner ? false : true  // Default to true
    };
    
    // Check connection settings
    if (!isOwner && connectionStatus === 'none') {
      // Apply connection restrictions based on settings
      if (user.connectionSettings.whoCanConnect === 'nobody') {
        connectionInfo.canConnect = false;
      } else if (user.connectionSettings.whoCanConnect === 'followers') {
        // Check if current user is a follower
        const isFollower = await Connection.exists({
          follower: currentUserId,
          following: userId,
          connectionType: 'followers',
          status: 'accepted'
        });
        
        connectionInfo.canConnect = isFollower ? true : false;
      }
    }
    
    return res.status(200).json({
      profile: profileData,
      connection: connectionInfo
    });
  } catch (error) {
    console.error('Error fetching user profile:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};