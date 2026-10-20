import { z } from 'zod';
import { Message } from '../models/Message.js';
import { Room } from '../models/Room.js';
import { getRoomForSocket } from './presenceStore.js';

// Zod schemas for socket payloads
export const chatMessageSchema = z.object({
  roomCode: z.string().trim().min(1, 'Room code is required'),
  text: z.string().trim().min(1, 'Message cannot be empty').max(500, 'Message cannot exceed 500 characters'),
});

export const chatTypingSchema = z.object({
  roomCode: z.string().trim().min(1, 'Room code is required'),
  isTyping: z.boolean(),
});

export const chatHistorySchema = z.object({
  roomCode: z.string().trim().min(1, 'Room code is required'),
});

/**
 * Sanitize text to prevent HTML injection and strip control characters
 */
export const sanitizeText = (str) => {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
    .trim()
    .slice(0, 500);
};

// In-memory sliding window rate limiter: userId -> array of timestamps
const userRateLimits = new Map();
const RATE_LIMIT_WINDOW_MS = 4000; // 4 seconds
const MAX_MESSAGES_PER_WINDOW = 6; // max 6 messages per 4 seconds

const isRateLimited = (userId) => {
  const now = Date.now();
  const timestamps = userRateLimits.get(userId) || [];
  // Keep only timestamps within window
  const recent = timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (recent.length >= MAX_MESSAGES_PER_WINDOW) {
    userRateLimits.set(userId, recent);
    return true;
  }
  recent.push(now);
  userRateLimits.set(userId, recent);
  return false;
};

/**
 * Register chat socket event handlers
 * @param {import('socket.io').Server} io
 * @param {import('socket.io').Socket} socket
 */
export const registerChatHandlers = (io, socket) => {
  /**
   * Client requests recent chat history (last 50 messages)
   */
  socket.on('chat:history', async (payload, callback) => {
    try {
      const roomCode =
        typeof payload === 'string'
          ? payload
          : payload?.roomCode || getRoomForSocket(socket.id);

      const parsed = chatHistorySchema.safeParse({ roomCode });
      if (!parsed.success) {
        const errorMsg = parsed.error.issues[0]?.message || 'Invalid room code';
        if (typeof callback === 'function') callback({ error: errorMsg });
        return;
      }

      const cleanCode = parsed.data.roomCode.toUpperCase();
      const messages = await Message.find({ roomCode: cleanCode })
        .sort({ createdAt: -1 })
        .limit(50)
        .lean();

      // Return chronologically (oldest to newest)
      const chronological = messages.reverse();

      socket.emit('chat:history', {
        roomCode: cleanCode,
        messages: chronological,
      });

      if (typeof callback === 'function') {
        callback({ success: true, messages: chronological });
      }
    } catch (error) {
      console.error('[chat:history] Error:', error.message);
      if (typeof callback === 'function') callback({ error: error.message });
    }
  });

  /**
   * Client sends a new chat message
   */
  socket.on('chat:message', async (payload, callback) => {
    try {
      const parsed = chatMessageSchema.safeParse(payload);
      if (!parsed.success) {
        const errorMsg = parsed.error.issues[0]?.message || 'Validation failed';
        if (typeof callback === 'function') callback({ error: errorMsg });
        return socket.emit('error', { message: errorMsg });
      }

      const userId = socket.user?._id;
      if (!userId) {
        const errorMsg = 'Unauthorized';
        if (typeof callback === 'function') callback({ error: errorMsg });
        return socket.emit('error', { message: errorMsg });
      }

      // Check per-user rate limit
      if (isRateLimited(userId.toString())) {
        const errorMsg = 'You are sending messages too quickly. Please slow down.';
        if (typeof callback === 'function') callback({ error: errorMsg });
        return socket.emit('error', { message: errorMsg });
      }

      const cleanCode = parsed.data.roomCode.toUpperCase();
      const room = await Room.findOne({ code: cleanCode });
      if (!room) {
        const errorMsg = 'Room not found';
        if (typeof callback === 'function') callback({ error: errorMsg });
        return socket.emit('error', { message: errorMsg });
      }

      // Sanitize message content
      const sanitizedText = sanitizeText(parsed.data.text);
      if (!sanitizedText) {
        const errorMsg = 'Message cannot be empty';
        if (typeof callback === 'function') callback({ error: errorMsg });
        return socket.emit('error', { message: errorMsg });
      }

      const messageDoc = await Message.create({
        roomId: room._id,
        roomCode: cleanCode,
        userId: socket.user._id,
        name: socket.user.name || 'Anonymous',
        text: sanitizedText,
      });

      const messagePayload = {
        _id: messageDoc._id.toString(),
        roomId: room._id.toString(),
        roomCode: cleanCode,
        userId: socket.user._id.toString(),
        name: messageDoc.name,
        text: messageDoc.text,
        createdAt: messageDoc.createdAt,
      };

      // Broadcast to all participants in the room
      io.to(cleanCode).emit('chat:message', messagePayload);

      if (typeof callback === 'function') {
        callback({ success: true, message: messagePayload });
      }
    } catch (error) {
      console.error('[chat:message] Error:', error.message);
      if (typeof callback === 'function') callback({ error: error.message });
    }
  });

  /**
   * Client signals typing state
   */
  socket.on('chat:typing', (payload) => {
    try {
      const parsed = chatTypingSchema.safeParse(payload);
      if (!parsed.success) return;

      const cleanCode = parsed.data.roomCode.toUpperCase();
      // Broadcast typing indicator to all other members in the room
      socket.to(cleanCode).emit('chat:typing', {
        roomCode: cleanCode,
        userId: socket.user?._id?.toString(),
        name: socket.user?.name || 'Someone',
        isTyping: parsed.data.isTyping,
      });
    } catch (error) {
      console.error('[chat:typing] Error:', error.message);
    }
  });

  /**
   * Clear typing on disconnect
   */
  socket.on('disconnect', () => {
    try {
      const roomCode = getRoomForSocket(socket.id);
      if (roomCode) {
        socket.to(roomCode).emit('chat:typing', {
          roomCode,
          userId: socket.user?._id?.toString(),
          name: socket.user?.name,
          isTyping: false,
        });
      }
    } catch (error) {
      console.error('[chat:disconnect] Error:', error.message);
    }
  });
};
