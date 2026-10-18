import express from 'express';
import {
  createRoom,
  getRoomByCode,
  getMyRooms,
  updateRoomSettings,
  getRoomSessions,
} from '../controllers/roomController.js';
import { protect } from '../middleware/auth.js';
import {
  validateCreateRoom,
  validateRoomSettings,
  validateRoomCode,
} from '../middleware/validate.js';

const router = express.Router();

// All room routes are protected by JWT authentication
router.use(protect);

router.post('/', validateCreateRoom, createRoom);
// Place /mine before /:code so Express matches the literal path first
router.get('/mine', getMyRooms);
router.get('/:code', validateRoomCode, getRoomByCode);
router.patch('/:code/settings', validateRoomCode, validateRoomSettings, updateRoomSettings);
router.get('/:code/sessions', validateRoomCode, getRoomSessions);

export default router;
