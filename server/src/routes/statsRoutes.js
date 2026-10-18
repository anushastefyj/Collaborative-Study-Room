import express from 'express';
import { getUserStats, getRoomStats } from '../controllers/statsController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

router.use(protect);

router.get('/', getUserStats);
router.get('/:code', getRoomStats);

export default router;
