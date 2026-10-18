/**
 * In-memory presence store for active room participants
 * Maps roomCode -> Map of socketId to member metadata
 * Maps socketId -> roomCode for O(1) lookup during disconnects
 */

// roomCode (uppercase) -> Map(socketId -> memberObject)
const roomMembers = new Map();

// socketId -> roomCode
const socketToRoom = new Map();

/**
 * Add a member to a room's presence list
 * @param {string} roomCode - 6-character room code
 * @param {string} socketId - Socket ID
 * @param {Object} user - User metadata ({ _id, name, email })
 * @returns {Array<Object>} Updated list of members in the room
 */
export const addMember = (roomCode, socketId, user) => {
  const code = roomCode.toUpperCase();

  if (!roomMembers.has(code)) {
    roomMembers.set(code, new Map());
  }

  const member = {
    socketId,
    userId: user._id,
    name: user.name,
    email: user.email,
    joinedAt: new Date().toISOString(),
  };

  roomMembers.get(code).set(socketId, member);
  socketToRoom.set(socketId, code);

  return getMembers(code);
};

/**
 * Remove a member from a room
 * @param {string} roomCode - 6-character room code
 * @param {string} socketId - Socket ID
 * @returns {Array<Object>} Updated list of members in the room
 */
export const removeMember = (roomCode, socketId) => {
  const code = roomCode.toUpperCase();
  const members = roomMembers.get(code);

  if (members) {
    members.delete(socketId);
    if (members.size === 0) {
      roomMembers.delete(code);
    }
  }

  socketToRoom.delete(socketId);
  return getMembers(code);
};

/**
 * Get all members currently in a room
 * @param {string} roomCode - 6-character room code
 * @returns {Array<Object>} List of members
 */
export const getMembers = (roomCode) => {
  const code = roomCode.toUpperCase();
  const members = roomMembers.get(code);
  if (!members) return [];
  return Array.from(members.values());
};

/**
 * Get the room code associated with a socket ID
 * @param {string} socketId - Socket ID
 * @returns {string|null}
 */
export const getRoomForSocket = (socketId) => {
  return socketToRoom.get(socketId) || null;
};
