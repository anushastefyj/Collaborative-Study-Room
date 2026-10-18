import { Session } from '../models/Session.js';
import { Room } from '../models/Room.js';

/**
 * Helper to compute continuous daily streak
 * @param {Record<string, number>} dateCountsMap - Map of YYYY-MM-DD to completedCount
 * @returns {number} Current streak in days
 */
const calculateStreak = (dateCountsMap) => {
  const MS_PER_DAY = 86400000;
  const now = new Date();

  const getDateStr = (offsetDays) => {
    const d = new Date(now.getTime() - offsetDays * MS_PER_DAY);
    return d.toISOString().slice(0, 10);
  };

  const todayStr = getDateStr(0);
  const yesterdayStr = getDateStr(1);

  let streak = 0;
  let startOffset = 0;

  // If user completed a session today, start streak from today
  if ((dateCountsMap[todayStr] || 0) > 0) {
    startOffset = 0;
  } else if ((dateCountsMap[yesterdayStr] || 0) > 0) {
    // If not completed today yet, check if streak from yesterday is still alive
    startOffset = 1;
  } else {
    return 0;
  }

  let offset = startOffset;
  while (true) {
    const targetDate = getDateStr(offset);
    if ((dateCountsMap[targetDate] || 0) > 0) {
      streak += 1;
      offset += 1;
    } else {
      break;
    }
  }

  return streak;
};

/**
 * Generate 7-day weekly history ending today
 * @param {Record<string, number>} dateCountsMap
 * @returns {Array<{ day: string, date: string, displayDate: string, sessions: number, focusMinutes: number, focusHours: number }>}
 */
const generateWeeklyHistory = (dateCountsMap) => {
  const MS_PER_DAY = 86400000;
  const now = new Date();
  const history = [];

  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getTime() - i * MS_PER_DAY);
    const dateStr = d.toISOString().slice(0, 10);
    const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
    const displayDate = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const count = dateCountsMap[dateStr] || 0;
    const focusMinutes = count * 25; // 25 min standard Pomodoro focus time
    const focusHours = +(focusMinutes / 60).toFixed(1);

    history.push({
      day: dayName,
      date: dateStr,
      displayDate,
      sessions: count,
      focusMinutes,
      focusHours,
    });
  }

  return history;
};

/**
 * @desc    Get user's overall study stats
 * @route   GET /api/stats
 * @access  Private
 */
export const getUserStats = async (req, res, next) => {
  try {
    const userId = req.user._id;

    // Find rooms hosted or created by user
    const userRooms = await Room.find({ host: userId }).select('_id code name');
    const roomCodes = userRooms.map((r) => r.code);

    // Find all sessions associated with user or user's rooms
    const query = {
      $or: [{ userId }, { roomCode: { $in: roomCodes } }],
    };

    const sessions = await Session.find(query).sort({ date: -1 });

    // Aggregate counts by date
    const dateCountsMap = {};
    const roomCountsMap = {};

    for (const s of sessions) {
      // By date
      dateCountsMap[s.date] = (dateCountsMap[s.date] || 0) + s.completedCount;

      // By room
      if (!roomCountsMap[s.roomCode]) {
        const foundRoom = userRooms.find((r) => r.code === s.roomCode);
        roomCountsMap[s.roomCode] = {
          roomCode: s.roomCode,
          roomName: foundRoom ? foundRoom.name : `Room ${s.roomCode}`,
          completedSessions: 0,
        };
      }
      roomCountsMap[s.roomCode].completedSessions += s.completedCount;
    }

    const totalSessions = Object.values(dateCountsMap).reduce((acc, c) => acc + c, 0);
    const totalFocusMinutes = totalSessions * 25;
    const totalFocusHours = +(totalFocusMinutes / 60).toFixed(1);
    const currentStreak = calculateStreak(dateCountsMap);
    const weeklyHistory = generateWeeklyHistory(dateCountsMap);

    const roomBreakdown = Object.values(roomCountsMap).sort(
      (a, b) => b.completedSessions - a.completedSessions
    );

    res.status(200).json({
      success: true,
      stats: {
        totalSessions,
        totalFocusMinutes,
        totalFocusHours,
        currentStreak,
        weeklyHistory,
        roomBreakdown,
        totalRoomsCount: userRooms.length,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get stats for a specific study room
 * @route   GET /api/stats/:code
 * @access  Private
 */
export const getRoomStats = async (req, res, next) => {
  try {
    const { code } = req.params;
    const cleanCode = code.trim().toUpperCase();

    const room = await Room.findOne({ code: cleanCode });
    if (!room) {
      return res.status(404).json({ message: 'Room not found' });
    }

    const sessions = await Session.find({ roomCode: cleanCode }).sort({ date: -1 });

    const dateCountsMap = {};
    for (const s of sessions) {
      dateCountsMap[s.date] = (dateCountsMap[s.date] || 0) + s.completedCount;
    }

    const totalSessions = sessions.reduce((acc, s) => acc + s.completedCount, 0);
    const totalFocusMinutes = totalSessions * 25;
    const totalFocusHours = +(totalFocusMinutes / 60).toFixed(1);
    const currentStreak = calculateStreak(dateCountsMap);
    const weeklyHistory = generateWeeklyHistory(dateCountsMap);

    res.status(200).json({
      success: true,
      room: {
        code: room.code,
        name: room.name,
      },
      stats: {
        totalSessions,
        totalFocusMinutes,
        totalFocusHours,
        currentStreak,
        weeklyHistory,
      },
    });
  } catch (error) {
    next(error);
  }
};
