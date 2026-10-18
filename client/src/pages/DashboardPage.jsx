import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { roomApi } from '../services/api.js';
import {
  PlusCircle,
  LogIn,
  Copy,
  Check,
  Calendar,
  Sparkles,
  ArrowRight,
  AlertCircle,
  Loader2,
  Users,
} from 'lucide-react';

export const DashboardPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  // Create room state
  const [roomName, setRoomName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  // Join room state
  const [joinCode, setJoinCode] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const [joinError, setJoinError] = useState('');

  // My rooms state
  const [myRooms, setMyRooms] = useState([]);
  const [isLoadingRooms, setIsLoadingRooms] = useState(true);
  const [copiedCode, setCopiedCode] = useState(null);

  // Fetch rooms user created
  const fetchMyRooms = async () => {
    try {
      setIsLoadingRooms(true);
      const data = await roomApi.getMyRooms();
      setMyRooms(data.rooms || []);
    } catch (err) {
      console.error('Failed to load my rooms:', err.message);
    } finally {
      setIsLoadingRooms(false);
    }
  };

  useEffect(() => {
    fetchMyRooms();
  }, []);

  // Handle creating room
  const handleCreateRoom = async (e) => {
    e.preventDefault();
    setCreateError('');

    if (!roomName.trim()) {
      setCreateError('Please enter a room name');
      return;
    }

    try {
      setIsCreating(true);
      const data = await roomApi.createRoom(roomName.trim());
      navigate(`/room/${data.room.code}`);
    } catch (err) {
      setCreateError(err.message || 'Failed to create room. Please try again.');
    } finally {
      setIsCreating(false);
    }
  };

  // Handle joining room by code
  const handleJoinRoom = async (e) => {
    e.preventDefault();
    setJoinError('');

    const code = joinCode.trim().toUpperCase();
    if (code.length !== 6) {
      setJoinError('Room code must be exactly 6 characters');
      return;
    }

    try {
      setIsJoining(true);
      // Verify room exists before navigating
      const data = await roomApi.getRoomByCode(code);
      navigate(`/room/${data.room.code}`);
    } catch (err) {
      setJoinError(err.message || 'Room not found. Check the code and try again.');
    } finally {
      setIsJoining(false);
    }
  };

  // Copy room code to clipboard
  const handleCopyCode = (code, e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-10">
      {/* Welcome Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-indigo-950/80 via-slate-900 to-violet-950/70 border border-indigo-500/20 p-8 sm:p-10 shadow-2xl">
        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-80 h-80 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 max-w-2xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-xs font-semibold mb-4">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Virtual Collaborative Workspace</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            Welcome, <span className="bg-gradient-to-r from-indigo-400 to-violet-400 bg-clip-text text-transparent">{user?.name || 'Scholar'}</span>!
          </h1>
          <p className="mt-3 text-slate-300 text-base sm:text-lg">
            Create an interactive study room or join an existing session with your peer group using a 6-character room code.
          </p>
        </div>
      </div>

      {/* Action Cards: Create & Join */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8">
        {/* Create Room Card */}
        <div className="glass-panel rounded-3xl p-7 border border-slate-800 shadow-xl flex flex-col justify-between">
          <div>
            <div className="w-12 h-12 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 text-indigo-400 flex items-center justify-center mb-5">
              <PlusCircle className="w-6 h-6" />
            </div>
            <h2 className="text-xl font-bold text-white mb-2">Create New Study Room</h2>
            <p className="text-sm text-slate-400 mb-6">
              Start a new room as host. A unique 6-character code will be generated for your study group to join.
            </p>

            {createError && (
              <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center gap-2 text-rose-300 text-xs">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>{createError}</span>
              </div>
            )}

            <form onSubmit={handleCreateRoom} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                  Room Name
                </label>
                <input
                  type="text"
                  required
                  value={roomName}
                  onChange={(e) => setRoomName(e.target.value)}
                  placeholder="e.g. Algorithms & System Design"
                  maxLength={80}
                  className="w-full px-4 py-3 rounded-xl bg-slate-900/80 border border-slate-700/80 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
                />
              </div>

              <button
                type="submit"
                disabled={isCreating}
                className="w-full py-3.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm shadow-lg shadow-indigo-600/25 flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-50"
              >
                {isCreating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Generating Room...</span>
                  </>
                ) : (
                  <>
                    <span>Create & Launch Room</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          </div>
        </div>

        {/* Join Room Card */}
        <div className="glass-panel rounded-3xl p-7 border border-slate-800 shadow-xl flex flex-col justify-between">
          <div>
            <div className="w-12 h-12 rounded-2xl bg-violet-600/20 border border-violet-500/30 text-violet-400 flex items-center justify-center mb-5">
              <LogIn className="w-6 h-6" />
            </div>
            <h2 className="text-xl font-bold text-white mb-2">Join with Room Code</h2>
            <p className="text-sm text-slate-400 mb-6">
              Have a 6-character room code from a classmate? Enter it below to join their live collaborative room.
            </p>

            {joinError && (
              <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center gap-2 text-rose-300 text-xs">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>{joinError}</span>
              </div>
            )}

            <form onSubmit={handleJoinRoom} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                  6-Character Room Code
                </label>
                <input
                  type="text"
                  required
                  maxLength={6}
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  placeholder="e.g. 7X9K2B"
                  className="w-full px-4 py-3 rounded-xl bg-slate-900/80 border border-slate-700/80 text-white placeholder-slate-500 text-center font-mono tracking-widest text-lg font-bold uppercase focus:outline-none focus:ring-2 focus:ring-violet-500 transition"
                />
              </div>

              <button
                type="submit"
                disabled={isJoining}
                className="w-full py-3.5 px-4 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-semibold text-sm shadow-lg shadow-violet-600/25 flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-50"
              >
                {isJoining ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Connecting to Room...</span>
                  </>
                ) : (
                  <>
                    <span>Join Room</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* My Created Rooms Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-white">Rooms You Created</h2>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300 font-semibold">
              {myRooms.length}
            </span>
          </div>
          <button
            onClick={fetchMyRooms}
            className="text-xs text-indigo-400 hover:text-indigo-300 font-medium transition cursor-pointer"
          >
            Refresh list
          </button>
        </div>

        {isLoadingRooms ? (
          <div className="p-12 glass-panel rounded-2xl flex flex-col items-center justify-center text-slate-400">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-500 mb-3" />
            <p className="text-sm">Loading your study rooms...</p>
          </div>
        ) : myRooms.length === 0 ? (
          <div className="p-12 glass-panel rounded-2xl text-center border border-dashed border-slate-800">
            <div className="w-12 h-12 mx-auto rounded-full bg-slate-900 flex items-center justify-center text-slate-500 mb-3">
              <Users className="w-6 h-6" />
            </div>
            <h3 className="text-base font-semibold text-slate-200">No rooms created yet</h3>
            <p className="text-sm text-slate-400 mt-1 max-w-sm mx-auto">
              Create your first study room above and invite friends by sharing your room code.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {myRooms.map((room) => (
              <div
                key={room._id}
                onClick={() => navigate(`/room/${room.code}`)}
                className="group p-5 rounded-2xl bg-slate-900/60 hover:bg-slate-900 border border-slate-800 hover:border-indigo-500/40 transition-all cursor-pointer shadow-lg hover:shadow-indigo-500/10 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <span className="font-mono text-xs px-2.5 py-1 rounded-lg bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 font-bold tracking-widest">
                      {room.code}
                    </span>
                    <button
                      onClick={(e) => handleCopyCode(room.code, e)}
                      title="Copy code"
                      className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white transition"
                    >
                      {copiedCode === room.code ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                  <h3 className="font-semibold text-slate-100 group-hover:text-indigo-300 transition-colors line-clamp-1">
                    {room.name}
                  </h3>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
                  <div className="flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-slate-500" />
                    <span>{new Date(room.createdAt).toLocaleDateString()}</span>
                  </div>
                  <span className="text-indigo-400 font-semibold group-hover:translate-x-0.5 transition-transform flex items-center gap-1">
                    Enter <ArrowRight className="w-3 h-3" />
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
