import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import cookie from 'cookie';

/**
 * Socket.IO authentication middleware
 * Authenticates socket connections using JWT from various sources
 */
export const socketAuthMiddleware = async (socket, next) => {
  try {
    console.log('🔒 Socket auth attempt:', socket.id);
    
    // Get token from all possible sources
    let token = null;
    
    // 1. Check headers for cookies
    if (socket.handshake.headers.cookie) {
      const cookies = cookie.parse(socket.handshake.headers.cookie);
      token = cookies.token;
      if (token) console.log('✅ Token found in cookies');
    }
    
    // 2. Check auth object (from client-side auth param)
    if (!token && socket.handshake.auth && socket.handshake.auth.token) {
      token = socket.handshake.auth.token;
      if (token) console.log('✅ Token found in auth object');
    }
    
    // 3. Check authorization header
    if (!token && socket.handshake.headers.authorization) {
      const authHeader = socket.handshake.headers.authorization;
      if (authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7);
        if (token) console.log('✅ Token found in authorization header');
      }
    }
    
    // 4. Check query string (insecure but sometimes necessary)
    if (!token && socket.handshake.query && socket.handshake.query.token) {
      token = socket.handshake.query.token;
      if (token) console.log('⚠️ Token found in query string (insecure)');
    }
    
    if (!token) {
      console.log('❌ No token found in any location');
      return next(new Error('Authentication required'));
    }
    
    // Verify token with both possible secrets
    let decoded = null;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
      console.log('✅ Token verified with JWT_SECRET');
    } catch (err) {
      try {
        decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
        console.log('✅ Token verified with JWT_REFRESH_SECRET');
      } catch (refreshErr) {
        console.log('❌ Token verification failed with both secrets');
        return next(new Error('Invalid authentication token'));
      }
    }
    
    // Extract user ID from the token
    const userId = decoded.id || decoded.userId || decoded.sub;
    if (!userId) {
      console.log('❌ No user ID found in token');
      return next(new Error('Invalid token format'));
    }
    
    console.log(`🔍 Looking up user: ${userId}`);
    
    // Find the user in the database
    const user = await User.findById(userId)
      .select('_id name email profilePicture')
      .lean();
      
    if (!user) {
      console.log('❌ User not found in database');
      return next(new Error('User not found'));
    }
    
    // Attach user info to the socket
    socket.user = {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      profilePicture: user.profilePicture
    };
    
    console.log(`✅ Socket authenticated for user: ${user._id} (${user.name || user.email})`);
    
    // Authentication successful
    next();
    
  } catch (err) {
    console.error('⚠️ Socket authentication error:', err.message);
    next(new Error('Authentication error'));
  }
};