import React, { useState, useEffect, useRef } from 'react';
import { useSocket } from '../context/SocketContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import {
  CheckSquare,
  Square,
  Plus,
  Trash2,
  Edit2,
  Check,
  X,
  User,
  Flame,
  Loader2,
  Sparkles,
} from 'lucide-react';

export const TaskList = ({ roomCode, members = [] }) => {
  const { socket, isConnected } = useSocket();
  const { user } = useAuth();

  const [tasks, setTasks] = useState([]);
  const [newTaskText, setNewTaskText] = useState('');
  const [selectedAssignee, setSelectedAssignee] = useState('');
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [editingText, setEditingText] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  // Load initial tasks and set up socket listeners
  useEffect(() => {
    if (!socket || !isConnected || !roomCode) return;

    const cleanCode = roomCode.toUpperCase();
    setIsLoading(true);

    // 1. Request tasks
    socket.emit('task:init', { roomCode: cleanCode }, (res) => {
      setIsLoading(false);
      if (res?.tasks) {
        setTasks(res.tasks);
      }
    });

    // 2. Listen to task:state (initial full list)
    const handleTaskState = (payload) => {
      if (payload?.roomCode?.toUpperCase() !== cleanCode) return;
      if (Array.isArray(payload.tasks)) {
        setTasks(payload.tasks);
        setIsLoading(false);
      }
    };

    // 3. Listen to task:add
    const handleTaskAdd = (task) => {
      if (task?.roomCode?.toUpperCase() !== cleanCode) return;
      setTasks((prev) => {
        if (prev.some((t) => t._id === task._id)) return prev;
        return [...prev, task];
      });
    };

    // 4. Listen to task:update
    const handleTaskUpdate = (task) => {
      if (task?.roomCode?.toUpperCase() !== cleanCode) return;
      setTasks((prev) =>
        prev.map((t) => {
          if (t._id === task._id) return task;
          // If this updated task is newly focused, un-focus all others
          if (task.isPomodoroFocus && t._id !== task._id && t.isPomodoroFocus) {
            return { ...t, isPomodoroFocus: false };
          }
          return t;
        })
      );
    };

    // 5. Listen to task:delete
    const handleTaskDelete = (payload) => {
      if (payload?.roomCode?.toUpperCase() !== cleanCode) return;
      setTasks((prev) => prev.filter((t) => t._id !== payload.taskId));
    };

    socket.on('task:state', handleTaskState);
    socket.on('task:add', handleTaskAdd);
    socket.on('task:update', handleTaskUpdate);
    socket.on('task:delete', handleTaskDelete);

    return () => {
      socket.off('task:state', handleTaskState);
      socket.off('task:add', handleTaskAdd);
      socket.off('task:update', handleTaskUpdate);
      socket.off('task:delete', handleTaskDelete);
    };
  }, [socket, isConnected, roomCode]);

  // Add task handler
  const handleAddTask = (e) => {
    e?.preventDefault();
    const cleanText = newTaskText.trim();
    if (!cleanText || !socket || !isConnected || !roomCode) return;

    let assigneeId = null;
    let assigneeName = '';

    if (selectedAssignee) {
      const found = members.find((m) => m.userId === selectedAssignee);
      if (found) {
        assigneeId = found.userId;
        assigneeName = found.name;
      }
    }

    socket.emit('task:add', {
      roomCode: roomCode.toUpperCase(),
      text: cleanText,
      assignedTo: assigneeId,
      assignedToName: assigneeName,
    });

    setNewTaskText('');
  };

  // Toggle task completed
  const handleToggleComplete = (task) => {
    if (!socket || !isConnected || !roomCode) return;
    socket.emit('task:update', {
      roomCode: roomCode.toUpperCase(),
      taskId: task._id,
      completed: !task.completed,
    });
  };

  // Start editing task
  const handleStartEdit = (task) => {
    setEditingTaskId(task._id);
    setEditingText(task.text);
  };

  // Save edited task
  const handleSaveEdit = (taskId) => {
    const clean = editingText.trim();
    if (!clean || !socket || !isConnected || !roomCode) return;

    socket.emit('task:update', {
      roomCode: roomCode.toUpperCase(),
      taskId,
      text: clean,
    });
    setEditingTaskId(null);
  };

  // Delete task
  const handleDeleteTask = (taskId) => {
    if (!socket || !isConnected || !roomCode) return;
    socket.emit('task:delete', {
      roomCode: roomCode.toUpperCase(),
      taskId,
    });
  };

  // Toggle Pomodoro Focus link
  const handleTogglePomodoroFocus = (task) => {
    if (!socket || !isConnected || !roomCode) return;
    const willFocus = !task.isPomodoroFocus;
    socket.emit('task:update', {
      roomCode: roomCode.toUpperCase(),
      taskId: task._id,
      isPomodoroFocus: willFocus,
    });
  };

  // Change assignee for a task
  const handleChangeAssignee = (taskId, newAssigneeId) => {
    if (!socket || !isConnected || !roomCode) return;

    let assigneeName = '';
    let assigneeId = null;

    if (newAssigneeId) {
      const found = members.find((m) => m.userId === newAssigneeId);
      if (found) {
        assigneeId = found.userId;
        assigneeName = found.name;
      }
    }

    socket.emit('task:update', {
      roomCode: roomCode.toUpperCase(),
      taskId,
      assignedTo: assigneeId,
      assignedToName: assigneeName,
    });
  };

  // Calculate progress
  const totalTasks = tasks.length;
  const completedTasks = tasks.filter((t) => t.completed).length;
  const progressPercent = totalTasks === 0 ? 0 : Math.round((completedTasks / totalTasks) * 100);

  return (
    <div className="glass-panel rounded-3xl p-5 border border-slate-800 shadow-xl space-y-4">
      {/* Title & Progress Bar */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-indigo-600/20 text-indigo-400 flex items-center justify-center">
              <CheckSquare className="w-4 h-4" />
            </div>
            <h3 className="font-bold text-white text-sm">Shared Task List</h3>
          </div>
          <span className="text-xs font-semibold text-slate-300">
            {completedTasks} of {totalTasks} done ({progressPercent}%)
          </span>
        </div>

        {/* Progress Bar Track */}
        <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-indigo-500 to-emerald-500 rounded-full transition-all duration-500"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Add New Task Form */}
      <form onSubmit={handleAddTask} className="flex flex-col sm:flex-row gap-2">
        <input
          type="text"
          value={newTaskText}
          onChange={(e) => setNewTaskText(e.target.value)}
          placeholder="Add a new group study task..."
          maxLength={250}
          className="flex-1 bg-slate-900/90 border border-slate-800 focus:border-indigo-500 rounded-xl px-3.5 py-2 text-xs text-white placeholder:text-slate-500 focus:outline-none transition"
        />

        <div className="flex items-center gap-2">
          {/* Member assignment dropdown */}
          <select
            value={selectedAssignee}
            onChange={(e) => setSelectedAssignee(e.target.value)}
            className="bg-slate-900/90 border border-slate-800 text-slate-300 rounded-xl px-2.5 py-2 text-xs focus:outline-none focus:border-indigo-500 transition max-w-[130px] cursor-pointer"
          >
            <option value="">Unassigned</option>
            {members.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.name} {m.userId === user?._id ? '(You)' : ''}
              </option>
            ))}
          </select>

          <button
            type="submit"
            disabled={!newTaskText.trim()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-semibold text-xs transition shadow-md shadow-indigo-600/30 cursor-pointer shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add</span>
          </button>
        </div>
      </form>

      {/* Task Items List */}
      <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center p-6 text-slate-500">
            <Loader2 className="w-6 h-6 animate-spin text-indigo-500 mb-2" />
            <span className="text-xs">Loading tasks...</span>
          </div>
        ) : tasks.length === 0 ? (
          <div className="p-5 rounded-2xl bg-slate-900/40 text-center text-slate-500 text-xs border border-slate-800/60">
            No tasks created yet. Add a task above to track team progress!
          </div>
        ) : (
          tasks.map((task) => {
            const isEditing = editingTaskId === task._id;

            return (
              <div
                key={task._id}
                className={`p-3 rounded-2xl border transition-all ${
                  task.completed
                    ? 'bg-slate-950/40 border-slate-800/50 opacity-70'
                    : task.isPomodoroFocus
                    ? 'bg-indigo-950/40 border-indigo-500/50 shadow-md shadow-indigo-500/10'
                    : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  {/* Left: Checkbox & Text */}
                  <div className="flex items-start gap-2.5 flex-1 min-w-0">
                    <button
                      onClick={() => handleToggleComplete(task)}
                      className="mt-0.5 text-slate-400 hover:text-indigo-400 transition cursor-pointer shrink-0"
                    >
                      {task.completed ? (
                        <CheckSquare className="w-4 h-4 text-emerald-400" />
                      ) : (
                        <Square className="w-4 h-4 text-slate-500" />
                      )}
                    </button>

                    <div className="flex-1 min-w-0">
                      {isEditing ? (
                        <div className="flex items-center gap-1.5">
                          <input
                            type="text"
                            value={editingText}
                            onChange={(e) => setEditingText(e.target.value)}
                            className="w-full bg-slate-950 border border-indigo-500/50 rounded-lg px-2 py-1 text-xs text-white focus:outline-none"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSaveEdit(task._id);
                              if (e.key === 'Escape') setEditingTaskId(null);
                            }}
                          />
                          <button
                            onClick={() => handleSaveEdit(task._id)}
                            className="p-1 text-emerald-400 hover:bg-emerald-500/20 rounded cursor-pointer"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setEditingTaskId(null)}
                            className="p-1 text-rose-400 hover:bg-rose-500/20 rounded cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <p
                          className={`text-xs break-words leading-snug select-text ${
                            task.completed
                              ? 'line-through text-slate-500'
                              : 'text-slate-200'
                          }`}
                        >
                          {task.text}
                        </p>
                      )}

                      {/* Meta badges: Assigned & Pomodoro Focus */}
                      <div className="flex flex-wrap items-center gap-2 mt-2 text-[10px]">
                        {/* Assignee selector */}
                        <div className="flex items-center gap-1 text-slate-400">
                          <User className="w-3 h-3 text-slate-500" />
                          <select
                            value={task.assignedTo || ''}
                            onChange={(e) => handleChangeAssignee(task._id, e.target.value)}
                            className="bg-transparent text-slate-400 hover:text-slate-200 text-[10px] focus:outline-none cursor-pointer"
                          >
                            <option value="" className="bg-slate-900">
                              Unassigned
                            </option>
                            {members.map((m) => (
                              <option
                                key={m.userId}
                                value={m.userId}
                                className="bg-slate-900 text-white"
                              >
                                {m.name}
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Completed By indicator */}
                        {task.completed && task.completedByName && (
                          <span className="text-emerald-400/80">
                            ✓ Done by {task.completedByName}
                          </span>
                        )}

                        {/* Active Pomodoro focus badge */}
                        {task.isPomodoroFocus && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 font-semibold text-[9px] animate-pulse">
                            <Flame className="w-3 h-3 text-amber-400" /> Current Pomodoro Focus
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Actions right */}
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => handleTogglePomodoroFocus(task)}
                      title={
                        task.isPomodoroFocus
                          ? 'Unlink from Pomodoro timer'
                          : 'Set as current Pomodoro focus'
                      }
                      className={`p-1.5 rounded-lg text-xs transition cursor-pointer ${
                        task.isPomodoroFocus
                          ? 'bg-amber-500/20 text-amber-400 hover:bg-amber-500/30'
                          : 'text-slate-400 hover:text-amber-400 hover:bg-slate-800'
                      }`}
                    >
                      <Flame className="w-3.5 h-3.5" />
                    </button>

                    <button
                      onClick={() => handleStartEdit(task)}
                      title="Edit task text"
                      className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>

                    <button
                      onClick={() => handleDeleteTask(task._id)}
                      title="Delete task"
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
