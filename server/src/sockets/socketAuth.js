import jwt from 'jsonwebtoken';
import { User } from '../models/User.js';

/**
 * Socket.io middleware to authenticate connection using JWT
 */
export const socketAuth = async (socket, next) => {
  try {
    // Check auth token in handshake auth object or headers
    const token =
      socket.handshake.auth?.token ||
      socket.handshake.headers?.authorization?.replace(/^Bearer\s+/i, '');

    if (!token) {
      return next(new Error('Authentication error: No token provided'));
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('-passwordHash');

    if (!user) {
      return next(new Error('Authentication error: User not found'));
    }

    // Attach authenticated user information to socket
    socket.user = {
      _id: user._id.toString(),
      name: user.name,
      email: user.email,
    };

    next();
  } catch (error) {
    console.error('[Socket Auth] Authentication error:', error.message);
    next(new Error('Authentication error: Invalid or expired token'));
  }
};
