import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useSocket } from '../context/SocketContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import {
  Play,
  Pause,
  RotateCcw,
  Coffee,
  Brain,
  ShieldCheck,
  ShieldAlert,
  Flame,
  Volume2,
} from 'lucide-react';

/**
 * Synthesize a crystal-clear melodic chime using the Web Audio API
 */
const playTimerChime = () => {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;

    const audioCtx = new AudioContextClass();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = 'sine';
    // Play a dual tone chord (D5 to A5)
    osc.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5
    osc.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.15); // A5

    gain.gain.setValueAtTime(0.25, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 1.2);

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start();
    osc.stop(audioCtx.currentTime + 1.2);
  } catch (err) {
    console.warn('[PomodoroTimer] Web Audio not allowed or unavailable:', err.message);
  }
};

export const PomodoroTimer = ({ roomCode, isHost, onTimerAlert }) => {
  const { socket, isConnected } = useSocket();
  const { user } = useAuth();

  // Raw timer state from server
  const [timerState, setTimerState] = useState({
    mode: 'focus', // 'focus' | 'break'
    duration: 25 * 60,
    startedAt: null,
    pausedRemaining: 25 * 60,
    isRunning: false,
    anyoneCanControl: false,
    completedSessionsToday: 0,
  });

  // Client display seconds (computed directly from server timestamps)
  const [remainingSeconds, setRemainingSeconds] = useState(25 * 60);

  // Clock offset between client local clock and server clock in ms
  const clockOffsetRef = useRef(0);
  const timerStateRef = useRef(timerState);
  timerStateRef.current = timerState;

  /**
   * Compute exact remaining seconds using server timestamps & clock offset
   */
  const computeRemaining = useCallback((state) => {
    if (!state) return 0;
    if (!state.isRunning || !state.startedAt) {
      return state.pausedRemaining;
    }
    const currentServerTime = Date.now() + clockOffsetRef.current;
    const elapsedSeconds = Math.floor((currentServerTime - state.startedAt) / 1000);
    return Math.max(0, state.pausedRemaining - elapsedSeconds);
  }, []);

  // Synchronize server clock & subscribe to timer state events
  useEffect(() => {
    if (!socket || !isConnected || !roomCode) return;

    const cleanCode = roomCode.toUpperCase();

    // 1. One-time server clock synchronization to calculate clock skew & latency
    const clientSendTime = Date.now();
    socket.emit('timer:sync', clientSendTime, (res) => {
      if (res?.serverTime) {
        const roundTrip = Date.now() - clientSendTime;
        clockOffsetRef.current = res.serverTime - (clientSendTime + Math.floor(roundTrip / 2));
      }
    });

    // 2. Request current timer state
    socket.emit('timer:init', { roomCode: cleanCode });

    // 3. Listen to timer:state updates
    const handleTimerState = (payload) => {
      if (payload.roomCode?.toUpperCase() !== cleanCode) return;

      // Update clock offset continuously if serverTime is attached
      if (payload.serverTime) {
        clockOffsetRef.current = payload.serverTime - Date.now();
      }

      setTimerState(payload);
      setRemainingSeconds(computeRemaining(payload));

      // Handle auto-switch notification & chime
      if (payload.autoSwitched) {
        playTimerChime();
        const notificationMsg =
          payload.previousMode === 'focus'
            ? '🎉 Great job! Focus session complete. Enjoy your 5-minute break!'
            : '⏰ Break is over! Ready for another productive focus session?';

        if (typeof onTimerAlert === 'function') {
          onTimerAlert(notificationMsg, payload.previousMode === 'focus' ? 'success' : 'info');
        }
      }
    };

    socket.on('timer:state', handleTimerState);

    return () => {
      socket.off('timer:state', handleTimerState);
    };
  }, [socket, isConnected, roomCode, computeRemaining, onTimerAlert]);

  // UI interval loop to recompute display seconds every 500ms while running
  useEffect(() => {
    const updateDisplay = () => {
      setRemainingSeconds(computeRemaining(timerStateRef.current));
    };

    updateDisplay();
    const interval = setInterval(updateDisplay, 500);

    return () => clearInterval(interval);
  }, [computeRemaining]);

  // Format seconds into MM:SS
  const formatTime = (totalSecs) => {
    const m = Math.floor(totalSecs / 60);
    const s = totalSecs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Determine permissions
  const canControl = isHost || timerState.anyoneCanControl;

  // Control handlers
  const handleStart = () => {
    if (!canControl || !socket) return;
    socket.emit('timer:start', { roomCode: roomCode.toUpperCase() });
  };

  const handlePause = () => {
    if (!canControl || !socket) return;
    socket.emit('timer:pause', { roomCode: roomCode.toUpperCase() });
  };

  const handleReset = () => {
    if (!canControl || !socket) return;
    socket.emit('timer:reset', { roomCode: roomCode.toUpperCase() });
  };

  const handleSetMode = (mode, duration) => {
    if (!canControl || !socket) return;
    socket.emit('timer:setMode', {
      roomCode: roomCode.toUpperCase(),
      mode,
      duration,
    });
  };

  const handleToggleControl = (e) => {
    if (!isHost || !socket) return;
    const newValue = e.target.checked;
    socket.emit('timer:toggle-control', {
      roomCode: roomCode.toUpperCase(),
      anyoneCanControl: newValue,
    });
  };

  // Progress percentage calculation
  const totalDuration = timerState.duration || 25 * 60;
  const progressPercent = Math.min(
    100,
    Math.max(0, ((totalDuration - remainingSeconds) / totalDuration) * 100)
  );

  const isFocus = timerState.mode === 'focus';

  return (
    <div className="glass-panel rounded-3xl p-6 border border-slate-800 shadow-2xl relative overflow-hidden flex flex-col justify-between">
      {/* Background ambient gradient glow */}
      <div
        className={`absolute -top-10 -right-10 w-44 h-44 rounded-full blur-3xl pointer-events-none transition-colors duration-700 ${
          isFocus ? 'bg-indigo-500/10' : 'bg-emerald-500/10'
        }`}
      />

      <div>
        {/* Header: Mode Badge + Sessions Completed */}
        <div className="flex items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-2">
            <div
              className={`p-2 rounded-xl border ${
                isFocus
                  ? 'bg-indigo-600/20 border-indigo-500/30 text-indigo-400'
                  : 'bg-emerald-600/20 border-emerald-500/30 text-emerald-400'
              }`}
            >
              {isFocus ? <Brain className="w-4 h-4" /> : <Coffee className="w-4 h-4" />}
            </div>
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-white">
                {isFocus ? 'Focus Session' : 'Break Time'}
              </span>
              <p className="text-[11px] text-slate-400">
                {timerState.isRunning ? 'Active & Synchronized' : 'Paused'}
              </p>
            </div>
          </div>

          {/* Completed Focus Sessions Counter */}
          <div
            className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-slate-900 border border-slate-800 text-xs font-semibold text-slate-300"
            title="Completed focus sessions in this room today"
          >
            <Flame className="w-3.5 h-3.5 text-amber-400" />
            <span>{timerState.completedSessionsToday || 0}</span>
            <span className="text-[10px] text-slate-500 hidden sm:inline">done today</span>
          </div>
        </div>

        {/* Digital Time Display */}
        <div className="text-center py-4">
          <div
            className={`font-mono text-5xl sm:text-6xl font-black tracking-tight drop-shadow-md select-none transition-colors ${
              timerState.isRunning
                ? isFocus
                  ? 'text-indigo-400'
                  : 'text-emerald-400'
                : 'text-slate-300'
            }`}
          >
            {formatTime(remainingSeconds)}
          </div>

          {/* Progress Bar */}
          <div className="w-full bg-slate-900/80 rounded-full h-2 mt-4 overflow-hidden border border-slate-800">
            <div
              className={`h-full transition-all duration-500 ${
                isFocus
                  ? 'bg-gradient-to-r from-indigo-500 to-violet-500'
                  : 'bg-gradient-to-r from-emerald-500 to-teal-400'
              }`}
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {/* Mode Selector Buttons */}
        <div className="grid grid-cols-2 gap-2 my-4">
          <button
            onClick={() => handleSetMode('focus', 25 * 60)}
            disabled={!canControl}
            className={`py-2 px-3 rounded-xl text-xs font-semibold transition cursor-pointer flex items-center justify-center gap-1.5 ${
              isFocus
                ? 'bg-indigo-600/30 border border-indigo-500/50 text-indigo-300'
                : 'bg-slate-900 hover:bg-slate-800/80 border border-slate-800 text-slate-400 hover:text-white'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            <Brain className="w-3.5 h-3.5" />
            <span>Focus (25m)</span>
          </button>

          <button
            onClick={() => handleSetMode('break', 5 * 60)}
            disabled={!canControl}
            className={`py-2 px-3 rounded-xl text-xs font-semibold transition cursor-pointer flex items-center justify-center gap-1.5 ${
              !isFocus
                ? 'bg-emerald-600/30 border border-emerald-500/50 text-emerald-300'
                : 'bg-slate-900 hover:bg-slate-800/80 border border-slate-800 text-slate-400 hover:text-white'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            <Coffee className="w-3.5 h-3.5" />
            <span>Break (5m)</span>
          </button>
        </div>

        {/* Controls: Start / Pause & Reset */}
        <div className="flex items-center gap-2">
          {timerState.isRunning ? (
            <button
              onClick={handlePause}
              disabled={!canControl}
              className="flex-1 py-3 px-4 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-semibold text-xs shadow-lg shadow-amber-600/20 flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Pause className="w-4 h-4 fill-white" />
              <span>Pause Timer</span>
            </button>
          ) : (
            <button
              onClick={handleStart}
              disabled={!canControl}
              className={`flex-1 py-3 px-4 rounded-xl text-white font-semibold text-xs shadow-lg flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                isFocus
                  ? 'bg-indigo-600 hover:bg-indigo-500 shadow-indigo-600/25'
                  : 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/25'
              }`}
            >
              <Play className="w-4 h-4 fill-white" />
              <span>Start Timer</span>
            </button>
          )}

          <button
            onClick={handleReset}
            disabled={!canControl}
            className="p-3 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-white transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            title="Reset Timer"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Footer: Permission Status & Toggle */}
      <div className="mt-4 pt-4 border-t border-slate-800 flex items-center justify-between text-xs">
        {isHost ? (
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={timerState.anyoneCanControl}
              onChange={handleToggleControl}
              className="rounded accent-indigo-500 cursor-pointer"
            />
            <span className="text-slate-400 text-[11px]">
              Allow peers to control timer
            </span>
          </label>
        ) : (
          <div className="flex items-center gap-1.5 text-slate-400 text-[11px]">
            {timerState.anyoneCanControl ? (
              <>
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>Open controls active</span>
              </>
            ) : (
              <>
                <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
                <span>Host controls only</span>
              </>
            )}
          </div>
        )}

        <button
          onClick={playTimerChime}
          className="text-slate-500 hover:text-indigo-400 transition"
          title="Test chime sound"
        >
          <Volume2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
