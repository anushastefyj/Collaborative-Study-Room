import { Room } from '../models/Room.js';
import { generateUniqueRoomCode } from '../utils/generateCode.js';

/**
 * @desc    Create a new study room with a unique 6-character code
 * @route   POST /api/rooms
 * @access  Private
 */
export const createRoom = async (req, res, next) => {
  try {
    const { name } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Room name is required' });
    }

    // Generate unique 6-character alphanumeric code
    const code = await generateUniqueRoomCode();

    const room = await Room.create({
      code,
      name: name.trim(),
      host: req.user._id,
    });

    // Populate host details
    await room.populate('host', 'name email');

    res.status(201).json({
      success: true,
      room,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get room information by room code
 * @route   GET /api/rooms/:code
 * @access  Private
 */
export const getRoomByCode = async (req, res, next) => {
  try {
    const { code } = req.params;

    if (!code || code.trim().length !== 6) {
      return res.status(400).json({ message: 'Room code must be 6 alphanumeric characters' });
    }

    const room = await Room.findOne({ code: code.trim().toUpperCase() }).populate(
      'host',
      'name email'
    );

    if (!room) {
      return res.status(404).json({ message: `Room with code "${code.toUpperCase()}" not found` });
    }

    res.status(200).json({
      success: true,
      room,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get all study rooms created by the logged-in user
 * @route   GET /api/rooms/mine
 * @access  Private
 */
export const getMyRooms = async (req, res, next) => {
  try {
    const rooms = await Room.find({ host: req.user._id })
      .populate('host', 'name email')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: rooms.length,
      rooms,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update room settings (e.g. anyoneCanControlTimer)
 * @route   PATCH /api/rooms/:code/settings
 * @access  Private (Host only)
 */
export const updateRoomSettings = async (req, res, next) => {
  try {
    const { code } = req.params;
    const { anyoneCanControlTimer } = req.body;

    const room = await Room.findOne({ code: code.trim().toUpperCase() });
    if (!room) {
      return res.status(404).json({ message: 'Room not found' });
    }

    if (room.host.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Only the room host can update settings' });
    }

    if (typeof anyoneCanControlTimer === 'boolean') {
      room.settings = room.settings || {};
      room.settings.anyoneCanControlTimer = anyoneCanControlTimer;
      await room.save();
    }

    res.status(200).json({
      success: true,
      settings: room.settings,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get focus session history for a room
 * @route   GET /api/rooms/:code/sessions
 * @access  Private
 */
export const getRoomSessions = async (req, res, next) => {
  try {
    const { code } = req.params;
    const cleanCode = code.trim().toUpperCase();

    const sessions = await Session.find({ roomCode: cleanCode }).sort({ date: -1 });
    const today = new Date().toISOString().slice(0, 10);
    const todaySession = sessions.find((s) => s.date === today);

    res.status(200).json({
      success: true,
      todayCompletedCount: todaySession ? todaySession.completedCount : 0,
      totalSessions: sessions.reduce((acc, s) => acc + s.completedCount, 0),
      history: sessions,
    });
  } catch (error) {
    next(error);
  }
};
