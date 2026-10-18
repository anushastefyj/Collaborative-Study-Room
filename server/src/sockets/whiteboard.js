import { Whiteboard } from '../models/Whiteboard.js';
import { getRoomForSocket } from './presenceStore.js';

// In-memory cache of strokes per room: roomCode -> Array<Stroke>
const roomStrokes = new Map();

// Map of debounce timers for persisting strokes to MongoDB
const saveDebounceTimers = new Map();

/**
 * Loads strokes for a room from MongoDB into memory if not already cached
 * @param {string} roomCode
 * @returns {Promise<Array>}
 */
export const getOrLoadRoomStrokes = async (roomCode) => {
  const code = roomCode.toUpperCase();
  if (roomStrokes.has(code)) {
    return roomStrokes.get(code);
  }

  try {
    const doc = await Whiteboard.findOne({ roomCode: code });
    const strokes = doc ? doc.strokes.map((s) => (s.toObject ? s.toObject() : s)) : [];
    roomStrokes.set(code, strokes);
    return strokes;
  } catch (error) {
    console.error(`[Whiteboard] Failed to load strokes for ${code}:`, error.message);
    roomStrokes.set(code, []);
    return [];
  }
};

/**
 * Debounced persistence of room strokes to MongoDB
 * @param {string} roomCode
 */
const scheduleSaveToDb = (roomCode) => {
  const code = roomCode.toUpperCase();

  if (saveDebounceTimers.has(code)) {
    clearTimeout(saveDebounceTimers.get(code));
  }

  const timer = setTimeout(async () => {
    saveDebounceTimers.delete(code);
    const strokes = roomStrokes.get(code) || [];
    try {
      await Whiteboard.findOneAndUpdate(
        { roomCode: code },
        { strokes },
        { upsert: true, new: true }
      );
      console.log(`[Whiteboard] Persisted ${strokes.length} strokes to DB for room ${code}`);
    } catch (error) {
      console.error(`[Whiteboard] Failed to persist strokes for ${code}:`, error.message);
    }
  }, 1500); // 1.5s debounce

  saveDebounceTimers.set(code, timer);
};

/**
 * Register whiteboard socket event handlers
 * @param {import('socket.io').Server} io
 * @param {import('socket.io').Socket} socket
 */
export const registerWhiteboardHandlers = (io, socket) => {
  /**
   * Client requests initial or current board state
   */
  socket.on('board:init', async (payload, callback) => {
    try {
      const roomCode =
        typeof payload === 'string'
          ? payload
          : payload?.roomCode || getRoomForSocket(socket.id);

      if (!roomCode) return;
      const cleanCode = roomCode.toUpperCase();

      const strokes = await getOrLoadRoomStrokes(cleanCode);
      socket.emit('board:state', { roomCode: cleanCode, strokes });

      if (typeof callback === 'function') {
        callback({ success: true, strokesCount: strokes.length });
      }
    } catch (error) {
      console.error('[board:init] Error:', error.message);
    }
  });

  /**
   * Client draws a stroke (new stroke or batch of points)
   */
  socket.on('draw:stroke', async (strokeData) => {
    try {
      if (!strokeData || !strokeData.strokeId || !Array.isArray(strokeData.points)) {
        return;
      }

      const roomCode =
        strokeData.roomCode || getRoomForSocket(socket.id);

      if (!roomCode) return;
      const cleanCode = roomCode.toUpperCase();

      const strokes = await getOrLoadRoomStrokes(cleanCode);

      // Format stroke object with authenticated user ID
      const stroke = {
        strokeId: strokeData.strokeId,
        userId: socket.user?._id || strokeData.userId,
        color: strokeData.color || '#ffffff',
        size: strokeData.size || 3,
        tool: strokeData.tool === 'eraser' ? 'eraser' : 'pen',
        points: strokeData.points,
        createdAt: strokeData.createdAt || new Date().toISOString(),
      };

      // Check if strokeId already exists (in case client is appending points to active stroke)
      const existingIndex = strokes.findIndex((s) => s.strokeId === stroke.strokeId);
      if (existingIndex >= 0) {
        strokes[existingIndex] = stroke;
      } else {
        strokes.push(stroke);
      }

      // Broadcast to other peers in the room
      socket.to(cleanCode).emit('draw:stroke', stroke);

      // Debounced save to MongoDB
      scheduleSaveToDb(cleanCode);
    } catch (error) {
      console.error('[draw:stroke] Error:', error.message);
    }
  });

  /**
   * Client requests to undo their last stroke
   */
  socket.on('draw:undo', async (payload, callback) => {
    try {
      const roomCode =
        typeof payload === 'string'
          ? payload
          : payload?.roomCode || getRoomForSocket(socket.id);

      if (!roomCode) return;
      const cleanCode = roomCode.toUpperCase();
      const currentUserId = socket.user?._id;

      const strokes = await getOrLoadRoomStrokes(cleanCode);

      // Find the last stroke created by this user
      let strokeToRemoveIndex = -1;
      for (let i = strokes.length - 1; i >= 0; i--) {
        if (strokes[i].userId === currentUserId) {
          strokeToRemoveIndex = i;
          break;
        }
      }

      if (strokeToRemoveIndex >= 0) {
        const removedStroke = strokes.splice(strokeToRemoveIndex, 1)[0];

        // Broadcast undo to everyone in the room
        io.to(cleanCode).emit('draw:undo', {
          roomCode: cleanCode,
          strokeId: removedStroke.strokeId,
          userId: currentUserId,
        });

        scheduleSaveToDb(cleanCode);

        if (typeof callback === 'function') {
          callback({ success: true, strokeId: removedStroke.strokeId });
        }
      } else {
        if (typeof callback === 'function') {
          callback({ success: false, message: 'No stroke by user to undo' });
        }
      }
    } catch (error) {
      console.error('[draw:undo] Error:', error.message);
    }
  });

  /**
   * Client clears the entire whiteboard
   */
  socket.on('draw:clear', async (payload, callback) => {
    try {
      const roomCode =
        typeof payload === 'string'
          ? payload
          : payload?.roomCode || getRoomForSocket(socket.id);

      if (!roomCode) return;
      const cleanCode = roomCode.toUpperCase();

      // Clear memory
      roomStrokes.set(cleanCode, []);

      // Broadcast clear to all clients in the room
      io.to(cleanCode).emit('draw:clear', {
        roomCode: cleanCode,
        clearedBy: socket.user,
      });

      // Clear debounce timer and immediately update DB
      if (saveDebounceTimers.has(cleanCode)) {
        clearTimeout(saveDebounceTimers.get(cleanCode));
        saveDebounceTimers.delete(cleanCode);
      }

      await Whiteboard.findOneAndUpdate(
        { roomCode: cleanCode },
        { strokes: [] },
        { upsert: true }
      );

      console.log(`[Whiteboard] Whiteboard cleared for room ${cleanCode}`);

      if (typeof callback === 'function') {
        callback({ success: true });
      }
    } catch (error) {
      console.error('[draw:clear] Error:', error.message);
    }
  });
};
