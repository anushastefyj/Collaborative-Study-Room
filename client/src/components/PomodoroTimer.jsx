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
  Sparkles,
  Settings2,
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

/**
 * Play alarm sound file
 */
const playAlarmSound = () => {
  try {
    const audio = new Audio('/sounds/alarm.wav');
    audio.play().catch(() => playTimerChime());
  } catch {
    playTimerChime();
  }
};

export const PomodoroTimer = ({
  roomCode,
  isHost,
  onTimerAlert,
  onTimerStateChange,
}) => {
  const { socket, isConnected } = useSocket();
  const { user } = useAuth();

  // Raw timer state from server
  const [timerState, setTimerState] = useState({
    mode: 'focus', // 'focus' | 'break' | 'long_break'
    duration: 25 * 60,
    startedAt: null,
    pausedRemaining: 25 * 60,
    isRunning: false,
    anyoneCanControl: false,
    completedSessionsToday: 0,
    currentCycle: 1,
    cycleTarget: 4,
    syncAmbientWithTimer: true,
    activeTask: null,
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
      onTimerStateChange?.(payload);

      // Handle auto-switch notification, desktop notification & alarm sound
      if (payload.autoSwitched) {
        playAlarmSound();

        let notificationMsg = '';
        if (payload.mode === 'long_break') {
          notificationMsg = '🏆 Incredible work! 4 focus cycles completed. Take a restorative 15-minute Long Break!';
        } else if (payload.mode === 'break') {
          notificationMsg = '🎉 Focus session complete! Enjoy a refreshing 5-minute break.';
        } else {
          notificationMsg = '⏰ Break time is over! Ready for the next focus session?';
        }

        // Trigger browser notification if permission granted
        if (
          typeof window !== 'undefined' &&
          'Notification' in window &&
          Notification.permission === 'granted'
        ) {
          try {
            new Notification('StudySpace Pomodoro', {
              body: notificationMsg,
              icon: '/favicon.ico',
            });
          } catch (e) {
            console.warn('Failed showing notification:', e);
          }
        }

        if (typeof onTimerAlert === 'function') {
          onTimerAlert(
            notificationMsg,
            payload.mode === 'long_break' || payload.mode === 'break' ? 'success' : 'info'
          );
        }
      }
    };

    socket.on('timer:state', handleTimerState);

    return () => {
      socket.off('timer:state', handleTimerState);
    };
  }, [socket, isConnected, roomCode, computeRemaining, onTimerAlert, onTimerStateChange]);

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

  const handleCycleTargetChange = (e) => {
    if (!isHost || !socket) return;
    const newTarget = parseInt(e.target.value, 10);
    socket.emit('timer:setCycleTarget', {
      roomCode: roomCode.toUpperCase(),
      cycleTarget: newTarget,
    });
  };

  // Progress percentage calculation
  const totalDuration = timerState.duration || 25 * 60;
  const progressPercent = Math.min(
    100,
    Math.max(0, ((totalDuration - remainingSeconds) / totalDuration) * 100)
  );

  const isFocus = timerState.mode === 'focus';
  const isLongBreak = timerState.mode === 'long_break';
  const isBreak = timerState.mode === 'break';

  const currentCycle = timerState.currentCycle ?? 1;
  const cycleTarget = timerState.cycleTarget ?? 4;

  return (
    <div className="glass-panel rounded-3xl p-6 border border-slate-800 shadow-2xl relative overflow-hidden flex flex-col justify-between">
      {/* Background ambient gradient glow */}
      <div
        className={`absolute -top-10 -right-10 w-44 h-44 rounded-full blur-3xl pointer-events-none transition-colors duration-700 ${
          isFocus
            ? 'bg-indigo-500/10'
            : isLongBreak
            ? 'bg-purple-500/15'
            : 'bg-emerald-500/10'
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
                  : isLongBreak
                  ? 'bg-purple-600/20 border-purple-500/30 text-purple-400'
                  : 'bg-emerald-600/20 border-emerald-500/30 text-emerald-400'
              }`}
            >
              {isFocus ? (
                <Brain className="w-4 h-4" />
              ) : isLongBreak ? (
                <Sparkles className="w-4 h-4" />
              ) : (
                <Coffee className="w-4 h-4" />
              )}
            </div>
            <div>
              <span className="text-xs uppercase tracking-wider font-bold text-white block">
                {isFocus
                  ? 'Focus Interval'
                  : isLongBreak
                  ? 'Long Break (15m)'
                  : 'Short Break (5m)'}
              </span>
              <span className="text-[10px] text-slate-400">
                {timerState.isRunning ? 'Active now' : 'Paused / Ready'}
              </span>
            </div>
          </div>

          {/* Daily streak indicator */}
          <div
            className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs font-semibold"
            title="Total completed focus sessions in this room today"
          >
            <Flame className="w-3.5 h-3.5 text-amber-400" />
            <span>{timerState.completedSessionsToday || 0} today</span>
          </div>
        </div>

        {/* Linked Pomodoro Task Banner */}
        {timerState.activeTask && (
          <div className="mb-4 p-3 rounded-2xl bg-gradient-to-r from-amber-500/15 to-indigo-500/10 border border-amber-500/30 flex items-center gap-2 text-xs">
            <Flame className="w-4 h-4 text-amber-400 shrink-0 animate-pulse" />
            <div className="min-w-0 flex-1">
              <span className="text-[10px] uppercase font-bold text-amber-400 block tracking-wider">
                Current Focus Task:
              </span>
              <p className="text-white font-medium truncate">
                {timerState.activeTask.text}
              </p>
            </div>
          </div>
        )}

        {/* Cycle Progress Dots */}
        <div className="mb-4 p-2.5 rounded-2xl bg-slate-900/60 border border-slate-800/80 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <span className="text-[11px] font-semibold text-slate-300">Cycle:</span>
            <span className="font-mono text-indigo-400 font-bold">
              {currentCycle} / {cycleTarget}
            </span>
          </div>

          {/* Render progress dots */}
          <div className="flex items-center gap-2">
            {Array.from({ length: cycleTarget }).map((_, idx) => {
              const dotIndex = idx + 1;
              const isCompletedDot = dotIndex < currentCycle;
              const isCurrentDot = dotIndex === currentCycle;

              return (
                <div
                  key={idx}
                  title={`Session ${dotIndex} of ${cycleTarget}`}
                  className={`h-2.5 rounded-full transition-all duration-300 ${
                    isCurrentDot
                      ? 'w-6 bg-indigo-500 shadow-md shadow-indigo-500/50'
                      : isCompletedDot
                      ? 'w-2.5 bg-emerald-400'
                      : 'w-2.5 bg-slate-700'
                  }`}
                />
              );
            })}
          </div>
        </div>

        {/* Circular / Digital Time Display */}
        <div className="relative my-4 flex flex-col items-center justify-center py-4">
          <div className="text-5xl sm:text-6xl font-mono font-extrabold tracking-tight text-white drop-shadow-md select-none">
            {formatTime(remainingSeconds)}
          </div>

          {/* Progress Bar under time */}
          <div className="w-full h-2 rounded-full bg-slate-800 mt-5 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                isFocus
                  ? 'bg-gradient-to-r from-indigo-500 to-violet-500'
                  : isLongBreak
                  ? 'bg-gradient-to-r from-purple-500 to-pink-500'
                  : 'bg-gradient-to-r from-emerald-500 to-teal-400'
              }`}
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {/* Quick Mode Preset Buttons */}
        <div className="grid grid-cols-3 gap-2 mb-5">
          <button
            onClick={() => handleSetMode('focus', 25 * 60)}
            disabled={!canControl}
            className={`py-1.5 px-2 rounded-xl text-xs font-semibold border transition cursor-pointer ${
              isFocus
                ? 'bg-indigo-600 text-white border-indigo-500 shadow-md shadow-indigo-600/30'
                : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700 disabled:opacity-40'
            }`}
          >
            Focus (25m)
          </button>

          <button
            onClick={() => handleSetMode('break', 5 * 60)}
            disabled={!canControl}
            className={`py-1.5 px-2 rounded-xl text-xs font-semibold border transition cursor-pointer ${
              isBreak
                ? 'bg-emerald-600 text-white border-emerald-500 shadow-md shadow-emerald-600/30'
                : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700 disabled:opacity-40'
            }`}
          >
            Break (5m)
          </button>

          <button
            onClick={() => handleSetMode('long_break', 15 * 60)}
            disabled={!canControl}
            className={`py-1.5 px-2 rounded-xl text-xs font-semibold border transition cursor-pointer ${
              isLongBreak
                ? 'bg-purple-600 text-white border-purple-500 shadow-md shadow-purple-600/30'
                : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700 disabled:opacity-40'
            }`}
          >
            Long Break (15m)
          </button>
        </div>

        {/* Primary Controls: Play / Pause / Reset */}
        <div className="flex items-center justify-center gap-3">
          {timerState.isRunning ? (
            <button
              onClick={handlePause}
              disabled={!canControl}
              className="flex items-center gap-2 px-6 py-2.5 rounded-2xl bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-bold text-sm transition shadow-lg shadow-amber-600/30 cursor-pointer"
            >
              <Pause className="w-4 h-4 fill-current" />
              <span>Pause</span>
            </button>
          ) : (
            <button
              onClick={handleStart}
              disabled={!canControl}
              className="flex items-center gap-2 px-7 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold text-sm transition shadow-lg shadow-indigo-600/30 cursor-pointer"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>Start</span>
            </button>
          )}

          <button
            onClick={handleReset}
            disabled={!canControl}
            className="p-2.5 rounded-2xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white disabled:opacity-50 transition cursor-pointer"
            title="Reset timer to mode default"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Host Controls & Permission Section */}
      <div className="mt-5 pt-4 border-t border-slate-800/80 space-y-2">
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5 text-slate-400">
            {canControl ? (
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
            ) : (
              <ShieldAlert className="w-4 h-4 text-amber-400" />
            )}
            <span className="text-[11px]">
              {isHost
                ? 'Host controls enabled'
                : timerState.anyoneCanControl
                ? 'Open control mode'
                : 'Host only mode'}
            </span>
          </div>

          {/* Host Toggle Switch */}
          {isHost && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-slate-400">Open controls</span>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={timerState.anyoneCanControl}
                  onChange={handleToggleControl}
                  className="sr-only peer"
                />
                <div className="w-8 h-4 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-indigo-600"></div>
              </label>
            </div>
          )}
        </div>

        {/* Host Cycle Target Config */}
        {isHost && (
          <div className="flex items-center justify-between text-xs pt-2">
            <span className="text-[11px] text-slate-400">Long break after</span>
            <select
              value={cycleTarget}
              onChange={handleCycleTargetChange}
              className="bg-slate-900 border border-slate-800 text-slate-300 text-[11px] rounded-lg px-2 py-0.5 focus:outline-none focus:border-indigo-500 cursor-pointer"
            >
              <option value={2}>2 focus sessions</option>
              <option value={3}>3 focus sessions</option>
              <option value={4}>4 focus sessions</option>
              <option value={6}>6 focus sessions</option>
            </select>
          </div>
        )}
      </div>
    </div>
  );
};
