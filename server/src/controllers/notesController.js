import { Note } from '../models/Note.js';
import { Room } from '../models/Room.js';

/**
 * @desc    Get note for a room
 * @route   GET /api/notes/:code
 * @access  Private
 */
export const getRoomNote = async (req, res, next) => {
  try {
    const { code } = req.params;
    const cleanCode = code.trim().toUpperCase();

    const room = await Room.findOne({ code: cleanCode });
    if (!room) {
      return res.status(404).json({ message: 'Room not found' });
    }

    let note = await Note.findOne({ roomCode: cleanCode }).populate('lastEditedBy', 'name email');

    if (!note) {
      note = await Note.create({
        roomId: room._id,
        roomCode: cleanCode,
        content: '',
      });
    }

    res.status(200).json({
      success: true,
      note,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update or save note for a room via REST
 * @route   PUT /api/notes/:code
 * @access  Private
 */
export const updateRoomNote = async (req, res, next) => {
  try {
    const { code } = req.params;
    const { content } = req.body;
    const cleanCode = code.trim().toUpperCase();

    const room = await Room.findOne({ code: cleanCode });
    if (!room) {
      return res.status(404).json({ message: 'Room not found' });
    }

    const note = await Note.findOneAndUpdate(
      { roomCode: cleanCode },
      {
        roomId: room._id,
        roomCode: cleanCode,
        content: content || '',
        lastEditedBy: req.user._id,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).populate('lastEditedBy', 'name email');

    res.status(200).json({
      success: true,
      note,
    });
  } catch (error) {
    next(error);
  }
};
