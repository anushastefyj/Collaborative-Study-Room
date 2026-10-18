import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useSocket } from '../context/SocketContext.jsx';
import { roomApi } from '../services/api.js';
import { Toast } from '../components/Toast.jsx';
import {
  Users,
  Copy,
  Check,
  ArrowLeft,
  Crown,
  Sparkles,
  Clock,
  Layers,
  FileText,
  AlertCircle,
  Loader2,
  Share2,
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

  // Helper to add toast notification
  const addToast = useCallback((message, type = 'info') => {
    const id = Date.now() + Math.random().toString(36).substring(2, 6);
    setToasts((prev) => [...prev, { id, message, type }]);

    // Auto-dismiss after 4 seconds
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
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
    console.log(`Socket emitting room:join for ${cleanCode}`);
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
      console.log('Socket presence:update received:', payload);
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
      console.log(`Socket emitting room:leave for ${cleanCode}`);
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
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 relative">
      {/* Toast Notification Container */}
      <div className="fixed top-20 right-4 sm:right-6 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-auto">
        {toasts.map((toast) => (
          <Toast key={toast.id} toast={toast} onClose={removeToast} />
        ))}
      </div>

      {/* Navigation & Top Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <button
          onClick={() => navigate('/dashboard')}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:border-slate-700 text-sm font-medium transition cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Exit to Dashboard</span>
        </button>

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

      {/* Room Hero Card */}
      <div className="glass-panel rounded-3xl p-6 sm:p-8 border border-slate-800 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-72 h-72 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-2.5 mb-2">
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                {room.name}
              </h1>
              {isHost && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 border border-amber-500/30 text-amber-300">
                  <Crown className="w-3 h-3 text-amber-400" /> Host
                </span>
              )}
            </div>
            <p className="text-sm text-slate-400">
              Hosted by <span className="text-slate-200 font-medium">{room.host?.name || 'A Peer'}</span> • Created {new Date(room.createdAt).toLocaleDateString()}
            </p>
          </div>

          {/* Quick share button */}
          <div className="flex items-center gap-3">
            <button
              onClick={handleCopyCode}
              className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm flex items-center gap-2 shadow-lg shadow-indigo-600/20 transition cursor-pointer"
            >
              <Share2 className="w-4 h-4" />
              <span>Share Code</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Grid: Live Participants List + Workspace Placeholder */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Live Participants (Primary Phase 1 Requirement) */}
        <div className="lg:col-span-1 space-y-4">
          <div className="glass-panel rounded-3xl p-6 border border-slate-800">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-indigo-600/20 text-indigo-400 flex items-center justify-center">
                  <Users className="w-4 h-4" />
                </div>
                <h2 className="font-bold text-white text-lg">In This Room</h2>
              </div>
              <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-950/60 border border-emerald-800 text-emerald-300">
                {members.length} {members.length === 1 ? 'online' : 'online'}
              </span>
            </div>

            {/* Member List */}
            <div className="space-y-3">
              {members.length === 0 ? (
                <div className="p-4 rounded-2xl bg-slate-900/50 text-center text-slate-500 text-xs">
                  Connecting to live presence...
                </div>
              ) : (
                members.map((member) => {
                  const isMemberHost = member.userId === room.host?._id;
                  const isYou = member.userId === currentUser?._id;

                  return (
                    <div
                      key={member.socketId}
                      className={`flex items-center justify-between p-3.5 rounded-2xl border transition-all ${
                        isYou
                          ? 'bg-indigo-950/30 border-indigo-500/30'
                          : 'bg-slate-900/50 border-slate-800/80 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {/* Avatar */}
                        <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-600 text-white font-bold text-sm flex items-center justify-center shrink-0 shadow-md">
                          {member.name ? member.name.charAt(0).toUpperCase() : '?'}
                        </div>

                        {/* Name & Email */}
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm font-semibold text-white truncate">
                              {member.name}
                            </span>
                            {isYou && (
                              <span className="text-[10px] px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-300 font-semibold">
                                You
                              </span>
                            )}
                          </div>
                          <span className="text-xs text-slate-400 truncate block">
                            {member.email}
                          </span>
                        </div>
                      </div>

                      {/* Badges */}
                      <div className="shrink-0 flex items-center gap-1">
                        {isMemberHost && (
                          <span
                            title="Room Host"
                            className="p-1 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20"
                          >
                            <Crown className="w-3.5 h-3.5" />
                          </span>
                        )}
                        <span className="relative flex h-2 w-2 ml-1" title="Active now">
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

        {/* Right Column: Interactive Study Workspace (Structured for Phase 2 & Phase 3) */}
        <div className="lg:col-span-2 space-y-6">
          <div className="glass-panel rounded-3xl p-8 border border-slate-800 flex flex-col items-center justify-center text-center min-h-[380px]">
            <div className="w-16 h-16 rounded-3xl bg-indigo-600/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center mb-4">
              <Sparkles className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-bold text-white mb-2">
              Collaborative Workspace Active
            </h3>
            <p className="text-sm text-slate-400 max-w-md mb-8">
              You and your study group are now connected via real-time WebSocket channels.
              Share your room code with others to study together!
            </p>

            {/* Upcoming Phase Modules preview */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full max-w-xl text-left">
              <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800">
                <div className="flex items-center gap-2 text-indigo-400 mb-1.5">
                  <Layers className="w-4 h-4" />
                  <span className="text-xs font-bold uppercase tracking-wider">Phase 2</span>
                </div>
                <h4 className="text-sm font-semibold text-slate-200">Whiteboard</h4>
                <p className="text-[11px] text-slate-500 mt-0.5">Shared real-time canvas</p>
              </div>

              <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800">
                <div className="flex items-center gap-2 text-violet-400 mb-1.5">
                  <Clock className="w-4 h-4" />
                  <span className="text-xs font-bold uppercase tracking-wider">Phase 2</span>
                </div>
                <h4 className="text-sm font-semibold text-slate-200">Timer</h4>
                <p className="text-[11px] text-slate-500 mt-0.5">Synchronized Pomodoro</p>
              </div>

              <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800">
                <div className="flex items-center gap-2 text-emerald-400 mb-1.5">
                  <FileText className="w-4 h-4" />
                  <span className="text-xs font-bold uppercase tracking-wider">Phase 3</span>
                </div>
                <h4 className="text-sm font-semibold text-slate-200">Notes</h4>
                <p className="text-[11px] text-slate-500 mt-0.5">Live markdown notes</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
