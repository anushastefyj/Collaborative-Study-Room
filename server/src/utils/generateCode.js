import crypto from 'crypto';
import { Room } from '../models/Room.js';

// Avoid visually confusing characters (e.g., 0/O, 1/I) for room codes
const CHARACTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * Generates a random 6-character alphanumeric room code
 * @returns {string} 6-character code
 */
export const generateRandomCode = () => {
  let result = '';
  const bytes = crypto.randomBytes(6);
  for (let i = 0; i < 6; i++) {
    result += CHARACTERS[bytes[i] % CHARACTERS.length];
  }
  return result;
};

/**
 * Generates a unique 6-character room code ensuring no collision in MongoDB
 * @returns {Promise<string>}
 */
export const generateUniqueRoomCode = async () => {
  let code = '';
  let exists = true;
  let attempts = 0;

  while (exists && attempts < 10) {
    code = generateRandomCode();
    const existingRoom = await Room.findOne({ code });
    if (!existingRoom) {
      exists = false;
    }
    attempts++;
  }

  if (exists) {
    throw new Error('Failed to generate a unique room code. Please try again.');
  }

  return code;
};
