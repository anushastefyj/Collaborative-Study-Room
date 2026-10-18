import express from 'express';
import { getRoomNote, updateRoomNote } from '../controllers/notesController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

router.use(protect);

router.get('/:code', getRoomNote);
router.put('/:code', updateRoomNote);

export default router;
