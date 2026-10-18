import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useSocket } from '../context/SocketContext.jsx';
import { roomApi } from '../services/api.js';
import { Toast } from '../components/Toast.jsx';
import { Whiteboard } from '../components/Whiteboard.jsx';
import { NotesPad } from '../components/NotesPad.jsx';
import { PomodoroTimer } from '../components/PomodoroTimer.jsx';
import {
  Users,
  Copy,
  Check,
  ArrowLeft,
  Crown,
  Share2,
  AlertCircle,
  Loader2,
  Layout,
  Timer as TimerIcon,
  PenTool,
  FileText,
  Columns,
} from 'lucide-react';

export const RoomPage = () => {
  const { code } = useParams();
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();
  const { socket, isConnected } = useSocket();

  // Room details state
  const [room, setRoom] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  // Live participants & notifications
  const [members, setMembers] = useState([]);
  const [toasts, setToasts] = useState([]);
  const [copied, setCopied] = useState(false);

  // Active view on mobile/small screens ('whiteboard' | 'notes' | 'timer')
  const [mobileTab, setMobileTab] = useState('whiteboard');

  // Active view on desktop ('whiteboard' | 'notes' | 'split')
  const [desktopTab, setDesktopTab] = useState('whiteboard');

  // Helper to add toast notification
  const addToast = useCallback((message, type = 'info') => {
    const id = Date.now() + Math.random().toString(36).substring(2, 6);
    setToasts((prev) => [...prev, { id, message, type }]);

    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }, []);

  const removeToast = (id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // 1. Fetch Room metadata from REST API
  useEffect(() => {
    let isMounted = true;

    const fetchRoom = async () => {
      try {
        setIsLoading(true);
        setError('');
        const data = await roomApi.getRoomByCode(code);
        if (isMounted) {
          setRoom(data.room);
        }
      } catch (err) {
        if (isMounted) {
          setError(err.message || 'Room not found or inaccessible.');
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    fetchRoom();

    return () => {
      isMounted = false;
    };
  }, [code]);

  // 2. Join Socket.io room and listen to presence events
  useEffect(() => {
    if (!socket || !isConnected || !code) return;

    const cleanCode = code.toUpperCase();

    // Emit room:join event
    socket.emit('room:join', { roomCode: cleanCode }, (response) => {
      if (response?.error) {
        console.error('room:join Server returned error:', response.error);
        addToast(response.error, 'error');
      } else if (response?.members) {
        setMembers(response.members);
      }
    });

    // Handle presence:update broadcast
    const handlePresenceUpdate = (payload) => {
      if (payload.roomCode?.toUpperCase() !== cleanCode) return;

      if (Array.isArray(payload.members)) {
        setMembers(payload.members);
      }

      // Show toast on join/leave
      if (payload.action === 'join' && payload.user) {
        const isSelf = payload.user._id === currentUser?._id;
        addToast(
          isSelf ? 'You joined the room' : `${payload.user.name} joined the room`,
          'join'
        );
      } else if (payload.action === 'leave' && payload.user) {
        const isSelf = payload.user._id === currentUser?._id;
        if (!isSelf) {
          addToast(`${payload.user.name || 'A participant'} left the room`, 'leave');
        }
      }
    };

    socket.on('presence:update', handlePresenceUpdate);

    // Cleanup on unmount or code change
    return () => {
      socket.emit('room:leave', { roomCode: cleanCode });
      socket.off('presence:update', handlePresenceUpdate);
    };
  }, [socket, isConnected, code, currentUser, addToast]);

  // Copy code handler
  const handleCopyCode = () => {
    if (!code) return;
    navigator.clipboard.writeText(code.toUpperCase());
    setCopied(true);
    addToast(`Room code ${code.toUpperCase()} copied to clipboard!`, 'success');
    setTimeout(() => setCopied(false), 2000);
  };

  if (isLoading) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center text-slate-400">
        <Loader2 className="w-10 h-10 animate-spin text-indigo-500 mb-4" />
        <p className="text-sm font-medium">Entering collaborative study room...</p>
      </div>
    );
  }

  if (error || !room) {
    return (
      <div className="max-w-xl mx-auto px-4 py-16 text-center">
        <div className="glass-panel p-8 rounded-3xl border border-rose-500/20">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-400 flex items-center justify-center mb-4">
            <AlertCircle className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Room Unavailable</h2>
          <p className="text-slate-400 text-sm mb-6">{error || 'This room does not exist or has expired.'}</p>
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm transition"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Return to Dashboard</span>
          </Link>
        </div>
      </div>
    );
  }

  const isHost = room.host?._id === currentUser?._id;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6 relative">
      {/* Toast Notification Container */}
      <div className="fixed top-20 right-4 sm:right-6 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-auto">
        {toasts.map((toast) => (
          <Toast key={toast.id} toast={toast} onClose={removeToast} />
        ))}
      </div>

      {/* Navigation & Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <button
          onClick={() => navigate('/dashboard')}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:border-slate-700 text-xs font-semibold transition cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Exit to Dashboard</span>
        </button>

        {/* Room Title & Host Info */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <h1 className="text-lg sm:text-xl font-bold text-white tracking-tight">
              {room.name}
            </h1>
            {isHost && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 border border-amber-500/30 text-amber-300">
                <Crown className="w-3 h-3 text-amber-400" /> Host
              </span>
            )}
          </div>
        </div>

        {/* Room Code Badge with Copy Action */}
        <div className="flex items-center gap-2 bg-slate-900/90 border border-indigo-500/30 px-3.5 py-1.5 rounded-2xl shadow-lg">
          <span className="text-xs uppercase text-slate-400 font-semibold tracking-wider">
            Room Code:
          </span>
          <span className="font-mono text-base font-bold text-indigo-400 tracking-widest">
            {room.code}
          </span>
          <button
            onClick={handleCopyCode}
            title="Copy room code"
            className="ml-1 p-1.5 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 hover:text-white transition cursor-pointer"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Mobile Tab Switcher (Visible on screens < lg: Board / Notes / Timer) */}
      <div className="flex lg:hidden bg-slate-900/80 p-1 rounded-2xl border border-slate-800">
        <button
          onClick={() => setMobileTab('whiteboard')}
          className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-semibold transition ${
            mobileTab === 'whiteboard'
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <PenTool className="w-3.5 h-3.5" />
          <span>Board</span>
        </button>
        <button
          onClick={() => setMobileTab('notes')}
          className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-semibold transition ${
            mobileTab === 'notes'
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          <span>Notes</span>
        </button>
        <button
          onClick={() => setMobileTab('timer-members')}
          className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-semibold transition ${
            mobileTab === 'timer-members'
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <TimerIcon className="w-3.5 h-3.5" />
          <span>Timer ({members.length})</span>
        </button>
      </div>

      {/* Main Layout Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Pomodoro Timer & In-Room Participants (lg: 4 cols) */}
        <div
          className={`lg:col-span-4 space-y-6 ${
            mobileTab === 'timer-members' ? 'block' : 'hidden lg:block'
          }`}
        >
          {/* Synchronized Pomodoro Timer */}
          <PomodoroTimer
            roomCode={room.code}
            isHost={isHost}
            onTimerAlert={(msg, type) => addToast(msg, type)}
          />

          {/* In This Room Presence Panel */}
          <div className="glass-panel rounded-3xl p-5 border border-slate-800 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-indigo-600/20 text-indigo-400 flex items-center justify-center">
                  <Users className="w-4 h-4" />
                </div>
                <h3 className="font-bold text-white text-sm">Participants</h3>
              </div>
              <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-950/60 border border-emerald-800 text-emerald-300">
                {members.length} online
              </span>
            </div>

            {/* Member List */}
            <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
              {members.length === 0 ? (
                <div className="p-4 rounded-xl bg-slate-900/50 text-center text-slate-500 text-xs">
                  Connecting to live presence...
                </div>
              ) : (
                members.map((member) => {
                  const isMemberHost = member.userId === room.host?._id;
                  const isYou = member.userId === currentUser?._id;

                  return (
                    <div
                      key={member.socketId}
                      className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
                        isYou
                          ? 'bg-indigo-950/30 border-indigo-500/30'
                          : 'bg-slate-900/50 border-slate-800/80 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-indigo-600 to-violet-600 text-white font-bold text-xs flex items-center justify-center shrink-0 shadow-md">
                          {member.name ? member.name.charAt(0).toUpperCase() : '?'}
                        </div>

                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-semibold text-white truncate">
                              {member.name}
                            </span>
                            {isYou && (
                              <span className="text-[9px] px-1 py-0.2 rounded bg-indigo-500/20 text-indigo-300 font-semibold">
                                You
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-slate-400 truncate block">
                            {member.email}
                          </span>
                        </div>
                      </div>

                      <div className="shrink-0 flex items-center gap-1.5">
                        {isMemberHost && (
                          <span
                            title="Room Host"
                            className="p-1 rounded-md bg-amber-500/10 text-amber-400 border border-amber-500/20"
                          >
                            <Crown className="w-3 h-3" />
                          </span>
                        )}
                        <span className="relative flex h-2 w-2" title="Active now">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Shared Whiteboard & Collaborative Notes (lg: 8 cols) */}
        <div className="lg:col-span-8 space-y-4">
          {/* Desktop Tab Switcher */}
          <div className="hidden lg:flex items-center justify-between bg-slate-900/60 p-1.5 rounded-2xl border border-slate-800">
            <div className="flex items-center gap-1 bg-slate-950/80 p-1 rounded-xl border border-slate-800/80">
              <button
                onClick={() => setDesktopTab('whiteboard')}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  desktopTab === 'whiteboard'
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <PenTool className="w-3.5 h-3.5" />
                <span>Shared Whiteboard</span>
              </button>

              <button
                onClick={() => setDesktopTab('notes')}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  desktopTab === 'notes'
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Collaborative Notes</span>
              </button>

              <button
                onClick={() => setDesktopTab('split')}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  desktopTab === 'split'
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="View Whiteboard and Notes stacked together"
              >
                <Columns className="w-3.5 h-3.5" />
                <span>Split View</span>
              </button>
            </div>

            <div className="text-[11px] text-slate-400 pr-2">
              Changes sync instantly with real-time CRDT & WebSockets
            </div>
          </div>

          {/* Desktop Content View */}
          <div className="hidden lg:block">
            {desktopTab === 'whiteboard' && (
              <div className="h-[650px] sm:h-[720px] flex flex-col">
                <Whiteboard roomCode={room.code} />
              </div>
            )}

            {desktopTab === 'notes' && (
              <div className="h-[650px] sm:h-[720px] flex flex-col">
                <NotesPad roomCode={room.code} />
              </div>
            )}

            {desktopTab === 'split' && (
              <div className="space-y-6">
                <div className="h-[520px] flex flex-col">
                  <Whiteboard roomCode={room.code} />
                </div>
                <div className="h-[480px] flex flex-col">
                  <NotesPad roomCode={room.code} />
                </div>
              </div>
            )}
          </div>

          {/* Mobile Content View */}
          <div className="block lg:hidden">
            {mobileTab === 'whiteboard' && (
              <div className="h-[560px] flex flex-col">
                <Whiteboard roomCode={room.code} />
              </div>
            )}

            {mobileTab === 'notes' && (
              <div className="h-[560px] flex flex-col">
                <NotesPad roomCode={room.code} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
