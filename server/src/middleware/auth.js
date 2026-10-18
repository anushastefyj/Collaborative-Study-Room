import jwt from 'jsonwebtoken';
import { User } from '../models/User.js';

/**
 * Authentication middleware to verify JWT token in Authorization header
 */
export const protect = async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    try {
      token = req.headers.authorization.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Attach user to request object (excluding password hash)
      const user = await User.findById(decoded.id).select('-passwordHash');

      if (!user) {
        return res.status(401).json({ message: 'User not found or token invalid' });
      }

      req.user = user;
      return next();
    } catch (error) {
      console.error('[Auth Middleware] Verification failed:', error.message);
      return res.status(401).json({ message: 'Not authorized, token invalid or expired' });
    }
  }

  if (!token) {
    return res.status(401).json({ message: 'Not authorized, no token provided' });
  }
};
