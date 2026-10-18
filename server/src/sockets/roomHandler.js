import {
  addMember,
  removeMember,
  getRoomForSocket,
} from './presenceStore.js';

/**
 * Register room and presence socket handlers
 * @param {import('socket.io').Server} io - Socket.io Server instance
 * @param {import('socket.io').Socket} socket - Connected socket instance
 */
export const registerRoomHandlers = (io, socket) => {
  /**
   * Handle room:join event
   * Payload can be a room code string or { roomCode: string }
   */
  socket.on('room:join', (payload, callback) => {
    try {
      const roomCode =
        typeof payload === 'string' ? payload : payload?.roomCode;

      if (!roomCode || typeof roomCode !== 'string') {
        const errorMsg = 'Invalid room code provided';
        if (typeof callback === 'function') callback({ error: errorMsg });
        return socket.emit('error', { message: errorMsg });
      }

      const cleanCode = roomCode.trim().toUpperCase();

      // If socket is already in another room, leave it first
      const previousRoom = getRoomForSocket(socket.id);
      if (previousRoom && previousRoom !== cleanCode) {
        const prevMembers = removeMember(previousRoom, socket.id);
        socket.leave(previousRoom);
        io.to(previousRoom).emit('presence:update', {
          roomCode: previousRoom,
          members: prevMembers,
          action: 'leave',
          user: socket.user,
        });
      }

      // Join socket.io room
      socket.join(cleanCode);

      // Add to presence store
      const members = addMember(cleanCode, socket.id, socket.user);

      console.log(
        `[Presence] User "${socket.user.name}" joined room ${cleanCode}. Active members: ${members.length}`
      );

      // Broadcast presence:update to ALL users in the room (including sender)
      io.to(cleanCode).emit('presence:update', {
        roomCode: cleanCode,
        members,
        action: 'join',
        user: socket.user,
      });

      // Optional acknowledgment callback
      if (typeof callback === 'function') {
        callback({ success: true, roomCode: cleanCode, members });
      }
    } catch (error) {
      console.error('[room:join] Error:', error.message);
      if (typeof callback === 'function') callback({ error: error.message });
    }
  });

  /**
   * Handle room:leave event
   */
  socket.on('room:leave', (payload, callback) => {
    try {
      const roomCode =
        typeof payload === 'string'
          ? payload
          : payload?.roomCode || getRoomForSocket(socket.id);

      if (!roomCode) return;

      const cleanCode = roomCode.trim().toUpperCase();
      const members = removeMember(cleanCode, socket.id);
      socket.leave(cleanCode);

      console.log(
        `[Presence] User "${socket.user.name}" left room ${cleanCode}. Active members: ${members.length}`
      );

      // Broadcast presence:update to remaining participants
      io.to(cleanCode).emit('presence:update', {
        roomCode: cleanCode,
        members,
        action: 'leave',
        user: socket.user,
      });

      if (typeof callback === 'function') {
        callback({ success: true, roomCode: cleanCode });
      }
    } catch (error) {
      console.error('[room:leave] Error:', error.message);
    }
  });

  /**
   * Cleanly handle socket disconnection
   */
  socket.on('disconnect', () => {
    try {
      const roomCode = getRoomForSocket(socket.id);
      if (roomCode) {
        const members = removeMember(roomCode, socket.id);

        console.log(
          `[Presence] User "${socket.user.name}" disconnected from room ${roomCode}. Active members: ${members.length}`
        );

        io.to(roomCode).emit('presence:update', {
          roomCode,
          members,
          action: 'leave',
          user: socket.user,
        });
      }
    } catch (error) {
      console.error('[Disconnect Handler] Error:', error.message);
    }
  });
};
