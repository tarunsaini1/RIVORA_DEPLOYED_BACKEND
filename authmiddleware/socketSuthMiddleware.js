import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import cookie from 'cookie';

export const socketAuthMiddleware = async (socket, next) => {
  try {
    // Parse cookies from handshake headers
    const cookies = socket.handshake.headers.cookie ? 
      cookie.parse(socket.handshake.headers.cookie) : {};
    
    // Get token from cookies, then fallback to auth methods
    const token = cookies.token || 
                 socket.handshake.auth.token || 
                 socket.handshake.headers.authorization?.split(' ')[1];
                 console.log('Token:', token);
    
    if (!token) {
      return next(new Error('Authentication error: No token provided'));
    }

    // Try with JWT_SECRET first, then JWT_REFRESH_SECRET if that fails
    let verified;
    try {
      verified = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      try {
        verified = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
      } catch (refreshErr) {
        return next(new Error('Authentication error: Invalid token'));
      }
    }

    // Find user and attach to socket
    const user = await User.findById(verified.id || verified.userId)
      .select('_id name email profilePicture projects')
      .lean();

    if (!user) {
      return next(new Error('Authentication error: User not found'));
    }

    // Attach user data to socket
    socket.user = user;
    next();
  } catch (err) {
    console.error('Socket authentication error:', err);
    return next(new Error('Authentication error: ' + (err.message || 'Unknown error')));
  }
};