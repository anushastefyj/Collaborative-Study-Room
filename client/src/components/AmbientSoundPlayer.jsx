import React, { useState, useEffect, useRef } from 'react';
import {
  Volume2,
  VolumeX,
  CloudRain,
  Music,
  Coffee,
  Bell,
  BellOff,
  Sliders,
  Radio,
} from 'lucide-react';

const TRACKS = [
  { id: 'none', label: 'Off', icon: VolumeX, file: null },
  { id: 'rain', label: 'Rain', icon: CloudRain, file: '/sounds/rain.wav' },
  { id: 'lofi', label: 'Lo-Fi', icon: Music, file: '/sounds/lofi.wav' },
  { id: 'cafe', label: 'Cafe Noise', icon: Coffee, file: '/sounds/cafe.wav' },
];

export const AmbientSoundPlayer = ({
  timerState,
  isHost,
  onToggleAmbientSync,
}) => {
  // Local user preferences
  const [selectedTrack, setSelectedTrack] = useState(() => {
    return localStorage.getItem('ambient_track') || 'none';
  });

  const [volume, setVolume] = useState(() => {
    const saved = localStorage.getItem('ambient_volume');
    return saved !== null ? parseFloat(saved) : 0.5;
  });

  const [isMuted, setIsMuted] = useState(() => {
    return localStorage.getItem('ambient_muted') === 'true';
  });

  const [notificationsEnabled, setNotificationsEnabled] = useState(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      return Notification.permission === 'granted';
    }
    return false;
  });

  const audioRef = useRef(null);

  // Sync state to localStorage
  useEffect(() => {
    localStorage.setItem('ambient_track', selectedTrack);
  }, [selectedTrack]);

  useEffect(() => {
    localStorage.setItem('ambient_volume', volume.toString());
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume;
    }
  }, [volume, isMuted]);

  useEffect(() => {
    localStorage.setItem('ambient_muted', isMuted.toString());
  }, [isMuted]);

  // Determine if ambient sound SHOULD play right now
  const activeTrackObj = TRACKS.find((t) => t.id === selectedTrack);
  const hasTrack = selectedTrack !== 'none' && activeTrackObj?.file;

  const syncWithTimer = timerState?.syncAmbientWithTimer ?? true;
  const isTimerFocusRunning = timerState?.isRunning && timerState?.mode === 'focus';

  // If sync is on, only play when timer is running in focus mode
  const shouldPlay = hasTrack && !isMuted && (!syncWithTimer || isTimerFocusRunning);

  useEffect(() => {
    if (!audioRef.current) return;

    if (shouldPlay) {
      audioRef.current.play().catch((err) => {
        console.warn('[AmbientSound] Autoplay prevented by browser:', err.message);
      });
    } else {
      audioRef.current.pause();
    }
  }, [shouldPlay, selectedTrack]);

  // Request browser notification permission
  const handleRequestNotification = async () => {
    if (!('Notification' in window)) {
      alert('This browser does not support desktop notifications.');
      return;
    }

    if (Notification.permission === 'granted') {
      setNotificationsEnabled(true);
      return;
    }

    try {
      const permission = await Notification.requestPermission();
      setNotificationsEnabled(permission === 'granted');
    } catch (err) {
      console.warn('Failed to request notification permission:', err);
    }
  };

  return (
    <div className="glass-panel rounded-3xl p-5 border border-slate-800 shadow-xl space-y-4">
      {/* Hidden audio element for ambient sounds */}
      <audio
        ref={audioRef}
        src={activeTrackObj?.file || undefined}
        loop
        preload="auto"
      />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-indigo-600/20 text-indigo-400 flex items-center justify-center">
            <Radio className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-bold text-white text-sm">Ambient Audio</h3>
            <p className="text-[10px] text-slate-400">Personal study soundscape</p>
          </div>
        </div>

        {/* Notification Permission Toggle */}
        <button
          onClick={handleRequestNotification}
          title={
            notificationsEnabled
              ? 'Notifications are enabled'
              : 'Enable desktop notifications for timer phase ends'
          }
          className={`p-2 rounded-xl border text-xs transition cursor-pointer flex items-center gap-1.5 ${
            notificationsEnabled
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
              : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
          }`}
        >
          {notificationsEnabled ? (
            <Bell className="w-3.5 h-3.5" />
          ) : (
            <BellOff className="w-3.5 h-3.5" />
          )}
          <span className="text-[10px] hidden sm:inline">
            {notificationsEnabled ? 'Alerts On' : 'Alerts Off'}
          </span>
        </button>
      </div>

      {/* Track Select Buttons */}
      <div className="grid grid-cols-4 gap-2">
        {TRACKS.map((track) => {
          const Icon = track.icon;
          const isSelected = selectedTrack === track.id;

          return (
            <button
              key={track.id}
              onClick={() => setSelectedTrack(track.id)}
              className={`flex flex-col items-center justify-center py-2.5 px-2 rounded-2xl border text-xs font-semibold transition cursor-pointer gap-1.5 ${
                isSelected
                  ? 'bg-indigo-600 text-white border-indigo-500 shadow-md shadow-indigo-600/30'
                  : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span className="text-[10px] truncate max-w-full">{track.label}</span>
            </button>
          );
        })}
      </div>

      {/* Volume & Mute Controls */}
      {selectedTrack !== 'none' && (
        <div className="flex items-center gap-3 pt-1">
          <button
            onClick={() => setIsMuted((prev) => !prev)}
            className="p-1.5 rounded-lg bg-slate-900 text-slate-400 hover:text-white transition cursor-pointer"
            title={isMuted ? 'Unmute' : 'Mute'}
          >
            {isMuted || volume === 0 ? (
              <VolumeX className="w-4 h-4 text-rose-400" />
            ) : (
              <Volume2 className="w-4 h-4 text-indigo-400" />
            )}
          </button>

          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={isMuted ? 0 : volume}
            onChange={(e) => {
              setVolume(parseFloat(e.target.value));
              if (isMuted) setIsMuted(false);
            }}
            className="flex-1 accent-indigo-500 cursor-pointer h-1.5 bg-slate-800 rounded-lg appearance-none"
          />

          <span className="text-[10px] font-mono text-slate-400 w-8 text-right">
            {isMuted ? '0%' : `${Math.round(volume * 100)}%`}
          </span>
        </div>
      )}

      {/* Host Settings: Sync ambient sound with timer */}
      {isHost && (
        <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs">
          <span className="text-slate-400 text-[11px]">
            Sync ambient audio with timer
          </span>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={timerState?.syncAmbientWithTimer ?? true}
              onChange={(e) => onToggleAmbientSync?.(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-8 h-4 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-indigo-600"></div>
          </label>
        </div>
      )}
    </div>
  );
};
