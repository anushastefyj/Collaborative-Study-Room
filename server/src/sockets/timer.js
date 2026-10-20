import { Room } from '../models/Room.js';
import { Session } from '../models/Session.js';
import { getRoomForSocket } from './presenceStore.js';

// Default durations in seconds
const DEFAULT_FOCUS_DURATION = 25 * 60;      // 25 minutes (1500s)
const DEFAULT_BREAK_DURATION = 5 * 60;       // 5 minutes (300s)
const DEFAULT_LONG_BREAK_DURATION = 15 * 60; // 15 minutes (900s)
const DEFAULT_CYCLE_TARGET = 4;              // 4 focus sessions before long break

/**
 * In-memory map of active timers per room:
 * roomCode -> {
 *   mode: "focus" | "break" | "long_break",
 *   duration: number, // total seconds for current mode
 *   startedAt: number | null, // timestamp in ms when started
 *   pausedRemaining: number, // remaining seconds when paused/started
 *   isRunning: boolean,
 *   anyoneCanControl: boolean,
 *   hostId: string,
 *   timeoutId: NodeJS.Timeout | null,
 *   currentCycle: number, // 1 to cycleTarget
 *   cycleTarget: number, // default 4
 *   syncAmbientWithTimer: boolean,
 *   activeTask: { taskId: string, text: string } | null
 * }
 */
const roomTimers = new Map();

/**
 * Get today's date string in UTC (YYYY-MM-DD)
 */
const getTodayDateString = () => {
  return new Date().toISOString().slice(0, 10);
};

/**
 * Set active Pomodoro task helper
 */
export const setRoomActiveTask = (roomCode, activeTask) => {
  const code = roomCode.toUpperCase();
  const timer = roomTimers.get(code);
  if (timer) {
    timer.activeTask = activeTask;
  }
};

/**
 * Get active Pomodoro task helper
 */
export const getRoomActiveTask = (roomCode) => {
  const code = roomCode.toUpperCase();
  const timer = roomTimers.get(code);
  return timer?.activeTask || null;
};

/**
 * Fetch today's completed session count from MongoDB
 * @param {string} roomCode
 * @returns {Promise<number>}
 */
export const getTodayCompletedCount = async (roomCode) => {
  try {
    const session = await Session.findOne({
      roomCode: roomCode.toUpperCase(),
      date: getTodayDateString(),
    });
    return session ? session.completedCount : 0;
  } catch (error) {
    console.error(`[Timer] Failed to get session count for ${roomCode}:`, error.message);
    return 0;
  }
};

/**
 * Increment completed focus session in DB
 * @param {string} roomCode
 * @returns {Promise<number>} Updated count
 */
const recordCompletedSession = async (roomCode) => {
  try {
    const code = roomCode.toUpperCase();
    const room = await Room.findOne({ code });
    if (!room) return 0;

    const date = getTodayDateString();
    const session = await Session.findOneAndUpdate(
      { roomCode: code, date },
      {
        $setOnInsert: { roomId: room._id },
        $inc: { completedCount: 1 },
      },
      { upsert: true, new: true }
    );

    console.log(`[Timer] Recorded completed focus session for room ${code}. Total today: ${session.completedCount}`);
    return session.completedCount;
  } catch (error) {
    console.error(`[Timer] Failed to record completed session for ${roomCode}:`, error.message);
    return 0;
  }
};

/**
 * Initialize or get timer state for a room
 * @param {string} roomCode
 * @returns {Promise<Object>}
 */
export const getOrInitRoomTimer = async (roomCode) => {
  const code = roomCode.toUpperCase();

  if (roomTimers.has(code)) {
    return roomTimers.get(code);
  }

  // Fetch host and settings from DB
  const room = await Room.findOne({ code });
  const hostId = room?.host ? room.host.toString() : '';
  const anyoneCanControl = room?.settings?.anyoneCanControlTimer ?? false;

  const timerState = {
    roomCode: code,
    mode: 'focus',
    duration: DEFAULT_FOCUS_DURATION,
    startedAt: null,
    pausedRemaining: DEFAULT_FOCUS_DURATION,
    isRunning: false,
    anyoneCanControl,
    hostId,
    timeoutId: null,
    currentCycle: 1,
    cycleTarget: DEFAULT_CYCLE_TARGET,
    syncAmbientWithTimer: true,
    activeTask: null,
  };

  roomTimers.set(code, timerState);
  return timerState;
};

/**
 * Helper to construct the client payload for timer:state
 */
export const formatTimerPayload = async (timerState, extra = {}) => {
  const completedSessionsToday = await getTodayCompletedCount(timerState.roomCode);

  return {
    roomCode: timerState.roomCode,
    mode: timerState.mode,
    duration: timerState.duration,
    startedAt: timerState.startedAt,
    pausedRemaining: timerState.pausedRemaining,
    isRunning: timerState.isRunning,
    anyoneCanControl: timerState.anyoneCanControl,
    currentCycle: timerState.currentCycle ?? 1,
    cycleTarget: timerState.cycleTarget ?? DEFAULT_CYCLE_TARGET,
    syncAmbientWithTimer: timerState.syncAmbientWithTimer ?? true,
    activeTask: timerState.activeTask ?? null,
    serverTime: Date.now(),
    completedSessionsToday,
    ...extra,
  };
};

/**
 * Register Pomodoro Timer socket event handlers
 * @param {import('socket.io').Server} io
 * @param {import('socket.io').Socket} socket
 */
export const registerTimerHandlers = (io, socket) => {
  /**
   * One-time clock sync to calculate network + clock skew offset
   */
  socket.on('timer:sync', (clientTime, callback) => {
    const serverTime = Date.now();
    if (typeof callback === 'function') {
      callback({ serverTime, clientTime });
    } else {
      socket.emit('timer:sync-response', { serverTime, clientTime });
    }
  });

  /**
   * Client requests current timer state (e.g. on mount or late join)
   */
  socket.on('timer:init', async (payload, callback) => {
    try {
      const roomCode =
        typeof payload === 'string'
          ? payload
          : payload?.roomCode || getRoomForSocket(socket.id);

      if (!roomCode) return;
      const cleanCode = roomCode.toUpperCase();

      const timer = await getOrInitRoomTimer(cleanCode);
      const statePayload = await formatTimerPayload(timer);

      socket.emit('timer:state', statePayload);

      if (typeof callback === 'function') {
        callback({ success: true, timer: statePayload });
      }
    } catch (error) {
      console.error('[timer:init] Error:', error.message);
    }
  });

  /**
   * Authorization check helper
   */
  const canControlTimer = (timer, user) => {
    if (timer.anyoneCanControl) return true;
    return timer.hostId === user?._id?.toString();
  };

  /**
   * Start Timer
   */
  socket.on('timer:start', async (payload, callback) => {
    try {
      const roomCode =
        typeof payload === 'string'
          ? payload
          : payload?.roomCode || getRoomForSocket(socket.id);

      if (!roomCode) return;
      const cleanCode = roomCode.toUpperCase();
      const timer = await getOrInitRoomTimer(cleanCode);

      if (!canControlTimer(timer, socket.user)) {
        const errorMsg = 'Only the room host can control the timer';
        if (typeof callback === 'function') callback({ error: errorMsg });
        return socket.emit('error', { message: errorMsg });
      }

      if (timer.isRunning) {
        if (typeof callback === 'function') callback({ success: true });
        return;
      }

      // Calculate exact remaining milliseconds
      const remainingMs = timer.pausedRemaining * 1000;
      timer.startedAt = Date.now();
      timer.isRunning = true;

      // Clear any prior pending completion timer
      if (timer.timeoutId) clearTimeout(timer.timeoutId);

      // Server-side schedule for timer completion and auto-switch
      timer.timeoutId = setTimeout(async () => {
        timer.isRunning = false;
        timer.startedAt = null;

        const previousMode = timer.mode;

        if (previousMode === 'focus') {
          // Record completed focus session in MongoDB
          await recordCompletedSession(cleanCode);

          // Check if we hit the cycle target for a Long Break
          if (timer.currentCycle >= timer.cycleTarget) {
            timer.mode = 'long_break';
            timer.duration = DEFAULT_LONG_BREAK_DURATION;
            timer.pausedRemaining = DEFAULT_LONG_BREAK_DURATION;
            timer.currentCycle = 1; // reset cycle after long break
          } else {
            // Short Break
            timer.mode = 'break';
            timer.duration = DEFAULT_BREAK_DURATION;
            timer.pausedRemaining = DEFAULT_BREAK_DURATION;
            timer.currentCycle += 1;
          }
        } else {
          // Auto-switch from break or long_break back to focus
          timer.mode = 'focus';
          timer.duration = DEFAULT_FOCUS_DURATION;
          timer.pausedRemaining = DEFAULT_FOCUS_DURATION;
        }

        const statePayload = await formatTimerPayload(timer, {
          autoSwitched: true,
          previousMode,
        });

        console.log(`[Timer] Auto-switched room ${cleanCode} from ${previousMode} to ${timer.mode}`);
        io.to(cleanCode).emit('timer:state', statePayload);
      }, remainingMs);

      const statePayload = await formatTimerPayload(timer);
      io.to(cleanCode).emit('timer:state', statePayload);

      if (typeof callback === 'function') callback({ success: true });
    } catch (error) {
      console.error('[timer:start] Error:', error.message);
    }
  });

  /**
   * Pause Timer
   */
  socket.on('timer:pause', async (payload, callback) => {
    try {
      const roomCode =
        typeof payload === 'string'
          ? payload
          : payload?.roomCode || getRoomForSocket(socket.id);

      if (!roomCode) return;
      const cleanCode = roomCode.toUpperCase();
      const timer = await getOrInitRoomTimer(cleanCode);

      if (!canControlTimer(timer, socket.user)) {
        const errorMsg = 'Only the room host can control the timer';
        if (typeof callback === 'function') callback({ error: errorMsg });
        return socket.emit('error', { message: errorMsg });
      }

      if (!timer.isRunning) {
        if (typeof callback === 'function') callback({ success: true });
        return;
      }

      // Clear completion timeout
      if (timer.timeoutId) {
        clearTimeout(timer.timeoutId);
        timer.timeoutId = null;
      }

      const elapsedSeconds = Math.floor((Date.now() - timer.startedAt) / 1000);
      timer.pausedRemaining = Math.max(0, timer.pausedRemaining - elapsedSeconds);
      timer.startedAt = null;
      timer.isRunning = false;

      const statePayload = await formatTimerPayload(timer);
      io.to(cleanCode).emit('timer:state', statePayload);

      if (typeof callback === 'function') callback({ success: true });
    } catch (error) {
      console.error('[timer:pause] Error:', error.message);
    }
  });

  /**
   * Reset Timer
   */
  socket.on('timer:reset', async (payload, callback) => {
    try {
      const roomCode =
        typeof payload === 'string'
          ? payload
          : payload?.roomCode || getRoomForSocket(socket.id);

      if (!roomCode) return;
      const cleanCode = roomCode.toUpperCase();
      const timer = await getOrInitRoomTimer(cleanCode);

      if (!canControlTimer(timer, socket.user)) {
        const errorMsg = 'Only the room host can control the timer';
        if (typeof callback === 'function') callback({ error: errorMsg });
        return socket.emit('error', { message: errorMsg });
      }

      if (timer.timeoutId) {
        clearTimeout(timer.timeoutId);
        timer.timeoutId = null;
      }

      timer.isRunning = false;
      timer.startedAt = null;
      timer.pausedRemaining = timer.duration;

      const statePayload = await formatTimerPayload(timer);
      io.to(cleanCode).emit('timer:state', statePayload);

      if (typeof callback === 'function') callback({ success: true });
    } catch (error) {
      console.error('[timer:reset] Error:', error.message);
    }
  });

  /**
   * Switch Mode (Focus vs Break vs Long Break) with optional custom duration
   */
  socket.on('timer:setMode', async (payload, callback) => {
    try {
      const roomCode = payload?.roomCode || getRoomForSocket(socket.id);
      const mode = payload?.mode; // 'focus' | 'break' | 'long_break'
      const customDuration = payload?.duration; // optional duration in seconds

      if (!roomCode || !['focus', 'break', 'long_break'].includes(mode)) return;
      const cleanCode = roomCode.toUpperCase();
      const timer = await getOrInitRoomTimer(cleanCode);

      if (!canControlTimer(timer, socket.user)) {
        const errorMsg = 'Only the room host can control the timer';
        if (typeof callback === 'function') callback({ error: errorMsg });
        return socket.emit('error', { message: errorMsg });
      }

      if (timer.timeoutId) {
        clearTimeout(timer.timeoutId);
        timer.timeoutId = null;
      }

      const newDuration =
        typeof customDuration === 'number' && customDuration > 0
          ? customDuration
          : mode === 'focus'
          ? DEFAULT_FOCUS_DURATION
          : mode === 'long_break'
          ? DEFAULT_LONG_BREAK_DURATION
          : DEFAULT_BREAK_DURATION;

      timer.mode = mode;
      timer.duration = newDuration;
      timer.pausedRemaining = newDuration;
      timer.startedAt = null;
      timer.isRunning = false;

      const statePayload = await formatTimerPayload(timer);
      io.to(cleanCode).emit('timer:state', statePayload);

      if (typeof callback === 'function') callback({ success: true });
    } catch (error) {
      console.error('[timer:setMode] Error:', error.message);
    }
  });

  /**
   * Host configures cycle target count (e.g. 2, 4, 6 focus sessions before long break)
   */
  socket.on('timer:setCycleTarget', async (payload, callback) => {
    try {
      const roomCode = payload?.roomCode || getRoomForSocket(socket.id);
      const cycleTarget = Number(payload?.cycleTarget);

      if (!roomCode || isNaN(cycleTarget) || cycleTarget < 1 || cycleTarget > 12) return;
      const cleanCode = roomCode.toUpperCase();
      const timer = await getOrInitRoomTimer(cleanCode);

      if (timer.hostId !== socket.user?._id?.toString()) {
        const errorMsg = 'Only the host can modify cycle settings';
        if (typeof callback === 'function') callback({ error: errorMsg });
        return socket.emit('error', { message: errorMsg });
      }

      timer.cycleTarget = cycleTarget;

      const statePayload = await formatTimerPayload(timer);
      io.to(cleanCode).emit('timer:state', statePayload);

      if (typeof callback === 'function') callback({ success: true });
    } catch (error) {
      console.error('[timer:setCycleTarget] Error:', error.message);
    }
  });

  /**
   * Host toggles "Anyone can control timer" setting
   */
  socket.on('timer:toggle-control', async (payload, callback) => {
    try {
      const roomCode = payload?.roomCode || getRoomForSocket(socket.id);
      const anyoneCanControl = !!payload?.anyoneCanControl;

      if (!roomCode) return;
      const cleanCode = roomCode.toUpperCase();
      const timer = await getOrInitRoomTimer(cleanCode);

      // Only host can change permissions
      if (timer.hostId !== socket.user?._id?.toString()) {
        const errorMsg = 'Only the host can modify room settings';
        if (typeof callback === 'function') callback({ error: errorMsg });
        return socket.emit('error', { message: errorMsg });
      }

      timer.anyoneCanControl = anyoneCanControl;

      // Persist setting in Room document
      await Room.findOneAndUpdate(
        { code: cleanCode },
        { 'settings.anyoneCanControlTimer': anyoneCanControl }
      );

      const statePayload = await formatTimerPayload(timer);
      io.to(cleanCode).emit('timer:state', statePayload);

      if (typeof callback === 'function') callback({ success: true });
    } catch (error) {
      console.error('[timer:toggle-control] Error:', error.message);
    }
  });

  /**
   * Host toggles "Sync ambient sound with timer"
   */
  socket.on('timer:toggle-ambient-sync', async (payload, callback) => {
    try {
      const roomCode = payload?.roomCode || getRoomForSocket(socket.id);
      const syncAmbientWithTimer = !!payload?.syncAmbientWithTimer;

      if (!roomCode) return;
      const cleanCode = roomCode.toUpperCase();
      const timer = await getOrInitRoomTimer(cleanCode);

      if (timer.hostId !== socket.user?._id?.toString()) {
        const errorMsg = 'Only the host can modify ambient sound sync settings';
        if (typeof callback === 'function') callback({ error: errorMsg });
        return socket.emit('error', { message: errorMsg });
      }

      timer.syncAmbientWithTimer = syncAmbientWithTimer;

      const statePayload = await formatTimerPayload(timer);
      io.to(cleanCode).emit('timer:state', statePayload);

      if (typeof callback === 'function') callback({ success: true });
    } catch (error) {
      console.error('[timer:toggle-ambient-sync] Error:', error.message);
    }
  });
};
