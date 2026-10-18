import * as Y from 'yjs';
import { Note } from '../models/Note.js';
import { Room } from '../models/Room.js';
import { getRoomForSocket } from './presenceStore.js';

// In-memory cache of Yjs documents per room: roomCode -> Y.Doc
const roomYDocs = new Map();

// Map of debounce timers for saving notes to MongoDB: roomCode -> Timeout
const noteSaveDebounceTimers = new Map();

// Map to track the last editor per room
const roomLastEditors = new Map();

/**
 * Loads or initializes the Y.Doc for a room from MongoDB
 * @param {string} roomCode
 * @returns {Promise<{ ydoc: Y.Doc, note: any }>}
 */
export const getOrLoadRoomYDoc = async (roomCode) => {
  const code = roomCode.toUpperCase();

  if (roomYDocs.has(code)) {
    return { ydoc: roomYDocs.get(code), note: null };
  }

  const ydoc = new Y.Doc();

  try {
    const note = await Note.findOne({ roomCode: code }).populate('lastEditedBy', 'name email');
    if (note && note.content) {
      const ytext = ydoc.getText('notes');
      ytext.insert(0, note.content);
    }
    roomYDocs.set(code, ydoc);
    return { ydoc, note };
  } catch (error) {
    console.error(`[Notes] Failed to load note for room ${code}:`, error.message);
    roomYDocs.set(code, ydoc);
    return { ydoc, note: null };
  }
};

/**
 * Schedule debounced persistence of Yjs text content to MongoDB Note model
 * @param {string} roomCode
 * @param {object} user - socket.user
 */
const scheduleNoteSaveToDb = (roomCode, user) => {
  const code = roomCode.toUpperCase();
  if (user) {
    roomLastEditors.set(code, user);
  }

  if (noteSaveDebounceTimers.has(code)) {
    clearTimeout(noteSaveDebounceTimers.get(code));
  }

  const timer = setTimeout(async () => {
    noteSaveDebounceTimers.delete(code);
    const ydoc = roomYDocs.get(code);
    if (!ydoc) return;

    const content = ydoc.getText('notes').toString();
    const lastUser = roomLastEditors.get(code);

    try {
      const room = await Room.findOne({ code });
      if (!room) return;

      const updateData = {
        roomId: room._id,
        roomCode: code,
        content,
      };

      if (lastUser?._id) {
        updateData.lastEditedBy = lastUser._id;
      }

      const savedNote = await Note.findOneAndUpdate(
        { roomCode: code },
        updateData,
        { upsert: true, new: true, setDefaultsOnInsert: true }
      ).populate('lastEditedBy', 'name email');

      console.log(`[Notes] Auto-saved note for room ${code} (${content.length} chars)`);
    } catch (error) {
      console.error(`[Notes] Error auto-saving note for room ${code}:`, error.message);
    }
  }, 2000); // 2-second debounce auto-save

  noteSaveDebounceTimers.set(code, timer);
};

/**
 * Register collaborative notes socket event handlers
 * @param {import('socket.io').Server} io
 * @param {import('socket.io').Socket} socket
 */
export const registerNotesHandlers = (io, socket) => {
  /**
   * Client requests initial note document state
   */
  socket.on('notes:init', async (payload, callback) => {
    try {
      const roomCode =
        typeof payload === 'string'
          ? payload
          : payload?.roomCode || getRoomForSocket(socket.id);

      if (!roomCode) {
        if (typeof callback === 'function') callback({ error: 'Room code required' });
        return;
      }

      const cleanCode = roomCode.toUpperCase();
      const { ydoc, note } = await getOrLoadRoomYDoc(cleanCode);

      const stateUpdate = Y.encodeStateAsUpdate(ydoc);
      const textContent = ydoc.getText('notes').toString();

      const responsePayload = {
        roomCode: cleanCode,
        content: textContent,
        stateUpdate: Array.from(stateUpdate),
        lastEditedBy: note?.lastEditedBy || roomLastEditors.get(cleanCode) || null,
        updatedAt: note?.updatedAt || new Date().toISOString(),
      };

      socket.emit('notes:init', responsePayload);

      if (typeof callback === 'function') {
        callback({ success: true, ...responsePayload });
      }
    } catch (error) {
      console.error('[notes:init] Error:', error.message);
      if (typeof callback === 'function') {
        callback({ error: 'Failed to initialize notes' });
      }
    }
  });

  /**
   * Client sends Yjs CRDT binary update
   */
  socket.on('notes:update', async (payload) => {
    try {
      if (!payload || !payload.update) return;

      const roomCode =
        payload.roomCode || getRoomForSocket(socket.id);

      if (!roomCode) return;
      const cleanCode = roomCode.toUpperCase();

      const { ydoc } = await getOrLoadRoomYDoc(cleanCode);

      // Convert update array or Buffer back to Uint8Array
      const updateData = new Uint8Array(payload.update);

      // Apply Yjs CRDT update locally to server doc
      Y.applyUpdate(ydoc, updateData, socket.id);

      // Broadcast the CRDT update to other clients in room
      socket.to(cleanCode).emit('notes:update', {
        roomCode: cleanCode,
        update: payload.update,
        userId: socket.user?._id,
        userName: socket.user?.name,
      });

      // Schedule debounced database auto-save
      scheduleNoteSaveToDb(cleanCode, socket.user);
    } catch (error) {
      console.error('[notes:update] Error:', error.message);
    }
  });

  /**
   * Client typing indicator
   */
  socket.on('notes:typing', (payload) => {
    try {
      const roomCode =
        payload?.roomCode || getRoomForSocket(socket.id);

      if (!roomCode) return;
      const cleanCode = roomCode.toUpperCase();

      socket.to(cleanCode).emit('notes:typing', {
        roomCode: cleanCode,
        userId: socket.user?._id,
        userName: socket.user?.name || 'Someone',
        isTyping: Boolean(payload?.isTyping),
      });
    } catch (error) {
      console.error('[notes:typing] Error:', error.message);
    }
  });
};
