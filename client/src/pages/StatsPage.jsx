import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { statsApi } from '../services/api.js';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import {
  Flame,
  Clock,
  CheckCircle2,
  BookOpen,
  ArrowRight,
  TrendingUp,
  Loader2,
  Calendar,
  Sparkles,
} from 'lucide-react';

export const StatsPage = () => {
  const [statsData, setStatsData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchStats = async () => {
    try {
      setIsLoading(true);
      setError('');
      const data = await statsApi.getUserStats();
      setStatsData(data.stats);
    } catch (err) {
      setError(err.message || 'Failed to load study statistics');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 flex flex-col items-center justify-center min-h-[60vh] text-slate-400">
        <Loader2 className="w-10 h-10 animate-spin text-indigo-500 mb-4" />
        <p className="text-sm font-medium">Aggregating your focus sessions & streaks...</p>
      </div>
    );
  }

  if (error || !statsData) {
    return (
      <div className="max-w-xl mx-auto px-4 py-16 text-center">
        <div className="glass-panel p-8 rounded-3xl border border-rose-500/20">
          <h2 className="text-xl font-bold text-white mb-2">Unable to Load Stats</h2>
          <p className="text-slate-400 text-sm mb-6">{error || 'Something went wrong.'}</p>
          <button
            onClick={fetchStats}
            className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm transition"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  const {
    totalSessions,
    totalFocusHours,
    totalFocusMinutes,
    currentStreak,
    weeklyHistory,
    roomBreakdown,
    totalRoomsCount,
  } = statsData;

  // Custom Recharts Tooltip
  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-slate-900/95 border border-slate-700/80 p-3 rounded-2xl shadow-2xl backdrop-blur-md">
          <p className="text-xs font-bold text-white mb-1">
            {data.day} • {data.displayDate}
          </p>
          <p className="text-xs text-indigo-400 font-semibold">
            {data.sessions} completed sessions
          </p>
          <p className="text-[11px] text-slate-400">
            {data.focusMinutes} focus minutes ({data.focusHours} hrs)
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-indigo-400 text-xs font-bold uppercase tracking-wider mb-1">
            <TrendingUp className="w-4 h-4" />
            <span>Study Analytics</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Focus & Productivity Dashboard
          </h1>
          <p className="text-sm text-slate-400">
            Real-time tracking of Pomodoro cycles, streak consistency, and time spent studying.
          </p>
        </div>

        <Link
          to="/dashboard"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:border-slate-700 text-xs font-semibold transition self-start sm:self-auto"
        >
          <span>Back to Rooms</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {/* 4 Stat Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        {/* Total Focus Hours */}
        <div className="glass-panel p-5 rounded-3xl border border-slate-800 shadow-xl relative overflow-hidden group hover:border-indigo-500/40 transition">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Focus Time
            </span>
            <div className="w-9 h-9 rounded-xl bg-indigo-600/20 text-indigo-400 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-white mb-1">
            {totalFocusHours} <span className="text-sm font-semibold text-slate-400">hours</span>
          </div>
          <p className="text-[11px] text-slate-500">
            Total {totalFocusMinutes} minutes across all rooms
          </p>
        </div>

        {/* Sessions Completed */}
        <div className="glass-panel p-5 rounded-3xl border border-slate-800 shadow-xl relative overflow-hidden group hover:border-emerald-500/40 transition">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Completed
            </span>
            <div className="w-9 h-9 rounded-xl bg-emerald-600/20 text-emerald-400 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-white mb-1">
            {totalSessions} <span className="text-sm font-semibold text-slate-400">sessions</span>
          </div>
          <p className="text-[11px] text-slate-500">25-minute Pomodoro cycles finished</p>
        </div>

        {/* Current Streak */}
        <div className="glass-panel p-5 rounded-3xl border border-slate-800 shadow-xl relative overflow-hidden group hover:border-amber-500/40 transition">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Daily Streak
            </span>
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center">
              <Flame className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-white mb-1 flex items-center gap-2">
            <span>{currentStreak}</span>
            <span className="text-sm font-semibold text-slate-400">days</span>
            {currentStreak > 0 && <span className="text-lg">🔥</span>}
          </div>
          <p className="text-[11px] text-slate-500">
            {currentStreak > 0 ? 'Study streak active! Keep going.' : 'Complete a session today to start a streak!'}
          </p>
        </div>

        {/* Total Rooms */}
        <div className="glass-panel p-5 rounded-3xl border border-slate-800 shadow-xl relative overflow-hidden group hover:border-violet-500/40 transition">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Study Spaces
            </span>
            <div className="w-9 h-9 rounded-xl bg-violet-600/20 text-violet-400 flex items-center justify-center">
              <BookOpen className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-white mb-1">
            {totalRoomsCount} <span className="text-sm font-semibold text-slate-400">rooms</span>
          </div>
          <p className="text-[11px] text-slate-500">Collaborative spaces created</p>
        </div>
      </div>

      {/* Weekly History Bar Chart (Recharts) */}
      <div className="glass-panel p-6 rounded-3xl border border-slate-800 shadow-2xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
              <Calendar className="w-4 h-4 text-indigo-400" />
              <span>Weekly Focus Rhythm (Past 7 Days)</span>
            </h2>
            <p className="text-xs text-slate-400">Completed 25-minute Pomodoro sessions per day</p>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span className="w-3 h-3 rounded-md bg-indigo-500 inline-block"></span>
            <span>Pomodoro Sessions</span>
          </div>
        </div>

        <div className="h-64 sm:h-72 w-full pt-4">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={weeklyHistory} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
              <XAxis
                dataKey="day"
                tick={{ fill: '#94a3b8', fontSize: 12 }}
                axisLine={{ stroke: '#334155' }}
                tickLine={false}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fill: '#94a3b8', fontSize: 12 }}
                axisLine={{ stroke: '#334155' }}
                tickLine={false}
              />
              <Tooltip content={<CustomTooltip />} />
              <Bar
                dataKey="sessions"
                fill="#6366f1"
                radius={[6, 6, 0, 0]}
                maxBarSize={48}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Room Breakdown Section */}
      <div className="glass-panel p-6 rounded-3xl border border-slate-800 shadow-2xl space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-indigo-400" />
              <span>Room Breakdown</span>
            </h2>
            <p className="text-xs text-slate-400">Focus sessions completed in each room</p>
          </div>
        </div>

        {roomBreakdown.length === 0 ? (
          <div className="text-center py-8 text-slate-500 text-xs">
            No completed sessions recorded yet. Start the Pomodoro timer in a study room to record your first session!
          </div>
        ) : (
          <div className="divide-y divide-slate-800/80">
            {roomBreakdown.map((item) => (
              <div
                key={item.roomCode}
                className="py-3.5 flex items-center justify-between gap-4 hover:bg-slate-900/30 px-2 rounded-xl transition"
              >
                <div className="min-w-0">
                  <h4 className="text-sm font-semibold text-white truncate">{item.roomName}</h4>
                  <span className="font-mono text-xs text-indigo-400 font-medium">
                    Code: {item.roomCode}
                  </span>
                </div>

                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <span className="text-sm font-bold text-white">
                      {item.completedSessions}
                    </span>
                    <span className="text-xs text-slate-400 ml-1">sessions</span>
                    <span className="block text-[10px] text-slate-500">
                      {+((item.completedSessions * 25) / 60).toFixed(1)} hrs
                    </span>
                  </div>

                  <Link
                    to={`/room/${item.roomCode}`}
                    className="p-2 rounded-xl bg-slate-900 hover:bg-indigo-600/30 text-slate-300 hover:text-white border border-slate-800 transition"
                    title="Enter this room"
                  >
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
