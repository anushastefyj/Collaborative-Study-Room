import express from 'express';
import { summarizeNotes } from '../controllers/aiController.js';
import { protect } from '../middleware/auth.js';
import { aiLimiter } from '../middleware/rateLimiter.js';

const router = express.Router();

// POST /api/ai/summarize - protected with JWT and rate limited to 15 req/hour
router.post('/summarize', protect, aiLimiter, summarizeNotes);

export default router;
