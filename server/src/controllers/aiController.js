import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import mongoose from 'mongoose';
import { Note } from '../models/Note.js';
import { Room } from '../models/Room.js';

const aiResponseSchema = z.object({
  summary: z.string().min(1, 'Summary is required'),
  keyPoints: z.array(z.string()).min(1, 'At least one key point is required'),
  flashcards: z
    .array(
      z.object({
        question: z.string().min(1, 'Flashcard question is required'),
        answer: z.string().min(1, 'Flashcard answer is required'),
      })
    )
    .min(3, 'At least 3 flashcards required'),
});

/**
 * Clean potential markdown wrappers from JSON string
 */
const extractJson = (text) => {
  const trimmed = text.trim();
  // Strip ```json and ``` if present
  const match = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (match) {
    return match[1].trim();
  }
  return trimmed;
};

/**
 * Summarize room notes and generate study flashcards via Anthropic Claude API
 * POST /api/ai/summarize
 * Body: { roomId: string } (or { roomCode: string })
 */
export const summarizeNotes = async (req, res, next) => {
  try {
    const { roomId, roomCode } = req.body;

    if (!roomId && !roomCode) {
      return res.status(400).json({
        success: false,
        message: 'Room ID or Room Code is required in request body',
      });
    }

    // Find Note document
    let note = null;
    if (roomCode) {
      note = await Note.findOne({ roomCode: roomCode.toUpperCase() });
    } else if (roomId) {
      if (mongoose.Types.ObjectId.isValid(roomId)) {
        note = await Note.findOne({ roomId });
      } else {
        // In case roomId was passed as the 6-character room code
        note = await Note.findOne({ roomCode: roomId.toUpperCase() });
      }
    }

    if (!note || !note.content || note.content.trim().length < 15) {
      return res.status(400).json({
        success: false,
        message:
          'Room notes are currently empty or too brief to summarize. Please write some collaborative notes in the room first!',
      });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey || apiKey.includes('your_anthropic_api_key')) {
      return res.status(503).json({
        success: false,
        message:
          'Anthropic API key is not configured on the server. Please add ANTHROPIC_API_KEY to server/.env to use AI features.',
      });
    }

    const anthropic = new Anthropic({ apiKey });

    const prompt = `You are an expert academic study assistant. Analyze the following collaborative study notes and return a strictly valid JSON object with:
1. "summary": A clear, concise 2-3 paragraph overview of the notes.
2. "keyPoints": An array of 4 to 8 essential bullet points capturing key concepts and formulas.
3. "flashcards": An array of 5 to 8 high-yield active-recall study flashcards, each having a "question" and "answer" string.

IMPORTANT: Return ONLY raw, valid JSON with NO commentary, preamble, or markdown codeblocks.

STUDY NOTES TO ANALYZE:
---
${note.content}
---`;

    let responseText = '';
    try {
      const message = await anthropic.messages.create({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 1500,
        temperature: 0.2,
        messages: [{ role: 'user', content: prompt }],
      });

      responseText = message.content?.[0]?.text || '';
    } catch (apiErr) {
      console.error('[AI Controller] Anthropic API Error:', apiErr.message);
      return res.status(502).json({
        success: false,
        message: `Anthropic AI service error: ${apiErr.message}`,
      });
    }

    // Parse and validate response
    let parsedData;
    try {
      const cleanJsonString = extractJson(responseText);
      parsedData = JSON.parse(cleanJsonString);
    } catch (parseErr) {
      console.error('[AI Controller] Failed parsing AI JSON:', parseErr.message, 'Raw:', responseText);
      return res.status(502).json({
        success: false,
        message: 'Failed to parse AI response into structured JSON. Please try again.',
      });
    }

    const validated = aiResponseSchema.safeParse(parsedData);
    if (!validated.success) {
      console.error('[AI Controller] Validation error:', validated.error.issues);
      return res.status(502).json({
        success: false,
        message: 'AI response failed schema validation. Please try again.',
      });
    }

    return res.status(200).json({
      success: true,
      summary: validated.data.summary,
      keyPoints: validated.data.keyPoints,
      flashcards: validated.data.flashcards,
      noteLastUpdated: note.updatedAt,
    });
  } catch (error) {
    next(error);
  }
};
