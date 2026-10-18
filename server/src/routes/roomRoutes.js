import express from 'express';
import {
  createRoom,
  getRoomByCode,
  getMyRooms,
} from '../controllers/roomController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// All room routes are protected by JWT authentication
router.use(protect);

router.post('/', createRoom);
// Place /mine before /:code so Express matches the literal path first
router.get('/mine', getMyRooms);
router.get('/:code', getRoomByCode);

export default router;
