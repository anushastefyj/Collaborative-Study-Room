import { z } from 'zod';
import { Task } from '../models/Task.js';
import { Room } from '../models/Room.js';
import { getRoomForSocket } from './presenceStore.js';
import { setRoomActiveTask, getOrInitRoomTimer, formatTimerPayload } from './timer.js';

// Zod validation schemas
export const taskInitSchema = z.object({
  roomCode: z.string().trim().min(1, 'Room code is required'),
});

export const taskAddSchema = z.object({
  roomCode: z.string().trim().min(1, 'Room code is required'),
  text: z.string().trim().min(1, 'Task text cannot be empty').max(250, 'Task text cannot exceed 250 characters'),
  assignedTo: z.string().nullable().optional(),
  assignedToName: z.string().optional().default(''),
});

export const taskUpdateSchema = z.object({
  roomCode: z.string().trim().min(1, 'Room code is required'),
  taskId: z.string().min(1, 'Task ID is required'),
  text: z.string().trim().min(1).max(250).optional(),
  completed: z.boolean().optional(),
  assignedTo: z.string().nullable().optional(),
  assignedToName: z.string().optional(),
  isPomodoroFocus: z.boolean().optional(),
});

export const taskDeleteSchema = z.object({
  roomCode: z.string().trim().min(1, 'Room code is required'),
  taskId: z.string().min(1, 'Task ID is required'),
});

/**
 * Register Shared Task List socket handlers
 * @param {import('socket.io').Server} io
 * @param {import('socket.io').Socket} socket
 */
export const registerTasksHandlers = (io, socket) => {
  /**
   * Request initial room tasks list
   */
  socket.on('task:init', async (payload, callback) => {
    try {
      const roomCode =
        typeof payload === 'string'
          ? payload
          : payload?.roomCode || getRoomForSocket(socket.id);

      const parsed = taskInitSchema.safeParse({ roomCode });
      if (!parsed.success) {
        const errorMsg = parsed.error.issues[0]?.message || 'Invalid room code';
        if (typeof callback === 'function') callback({ error: errorMsg });
        return;
      }

      const cleanCode = parsed.data.roomCode.toUpperCase();
      const tasks = await Task.find({ roomCode: cleanCode })
        .sort({ createdAt: 1 })
        .lean();

      socket.emit('task:state', { roomCode: cleanCode, tasks });

      if (typeof callback === 'function') {
        callback({ success: true, tasks });
      }
    } catch (error) {
      console.error('[task:init] Error:', error.message);
      if (typeof callback === 'function') callback({ error: error.message });
    }
  });

  /**
   * Add a new task
   */
  socket.on('task:add', async (payload, callback) => {
    try {
      const parsed = taskAddSchema.safeParse(payload);
      if (!parsed.success) {
        const errorMsg = parsed.error.issues[0]?.message || 'Validation failed';
        if (typeof callback === 'function') callback({ error: errorMsg });
        return socket.emit('error', { message: errorMsg });
      }

      const cleanCode = parsed.data.roomCode.toUpperCase();
      const room = await Room.findOne({ code: cleanCode });
      if (!room) {
        const errorMsg = 'Room not found';
        if (typeof callback === 'function') callback({ error: errorMsg });
        return socket.emit('error', { message: errorMsg });
      }

      const newTask = await Task.create({
        roomId: room._id,
        roomCode: cleanCode,
        text: parsed.data.text.trim(),
        assignedTo: parsed.data.assignedTo || null,
        assignedToName: parsed.data.assignedToName || '',
        completed: false,
      });

      const taskPayload = newTask.toObject();

      // Broadcast new task to all members in the room
      io.to(cleanCode).emit('task:add', taskPayload);

      if (typeof callback === 'function') {
        callback({ success: true, task: taskPayload });
      }
    } catch (error) {
      console.error('[task:add] Error:', error.message);
      if (typeof callback === 'function') callback({ error: error.message });
    }
  });

  /**
   * Update existing task (toggle completed, edit text, assign member, or link to pomodoro)
   */
  socket.on('task:update', async (payload, callback) => {
    try {
      const parsed = taskUpdateSchema.safeParse(payload);
      if (!parsed.success) {
        const errorMsg = parsed.error.issues[0]?.message || 'Validation failed';
        if (typeof callback === 'function') callback({ error: errorMsg });
        return socket.emit('error', { message: errorMsg });
      }

      const cleanCode = parsed.data.roomCode.toUpperCase();
      const { taskId, text, completed, assignedTo, assignedToName, isPomodoroFocus } = parsed.data;

      const updateFields = {};
      if (typeof text === 'string') updateFields.text = text.trim();
      if (typeof completed === 'boolean') {
        updateFields.completed = completed;
        updateFields.completedBy = completed ? socket.user?._id : null;
        updateFields.completedByName = completed ? socket.user?.name : '';
      }
      if (assignedTo !== undefined) updateFields.assignedTo = assignedTo;
      if (assignedToName !== undefined) updateFields.assignedToName = assignedToName;
      if (typeof isPomodoroFocus === 'boolean') {
        updateFields.isPomodoroFocus = isPomodoroFocus;
      }

      // If this task is being marked as current Pomodoro focus, unmark others in this room
      if (isPomodoroFocus === true) {
        await Task.updateMany(
          { roomCode: cleanCode, _id: { $ne: taskId } },
          { isPomodoroFocus: false }
        );
      }

      const updatedTask = await Task.findOneAndUpdate(
        { _id: taskId, roomCode: cleanCode },
        { $set: updateFields },
        { new: true }
      );

      if (!updatedTask) {
        const errorMsg = 'Task not found';
        if (typeof callback === 'function') callback({ error: errorMsg });
        return;
      }

      // Sync active task with Pomodoro timer if changed
      if (typeof isPomodoroFocus === 'boolean') {
        const activeTaskInfo = isPomodoroFocus
          ? { taskId: updatedTask._id.toString(), text: updatedTask.text }
          : null;
        setRoomActiveTask(cleanCode, activeTaskInfo);

        const timer = await getOrInitRoomTimer(cleanCode);
        const timerPayload = await formatTimerPayload(timer);
        io.to(cleanCode).emit('timer:state', timerPayload);
      }

      const taskPayload = updatedTask.toObject();

      // Broadcast update to all room members
      io.to(cleanCode).emit('task:update', taskPayload);

      if (typeof callback === 'function') {
        callback({ success: true, task: taskPayload });
      }
    } catch (error) {
      console.error('[task:update] Error:', error.message);
      if (typeof callback === 'function') callback({ error: error.message });
    }
  });

  /**
   * Delete task
   */
  socket.on('task:delete', async (payload, callback) => {
    try {
      const parsed = taskDeleteSchema.safeParse(payload);
      if (!parsed.success) {
        const errorMsg = parsed.error.issues[0]?.message || 'Validation failed';
        if (typeof callback === 'function') callback({ error: errorMsg });
        return socket.emit('error', { message: errorMsg });
      }

      const cleanCode = parsed.data.roomCode.toUpperCase();
      const { taskId } = parsed.data;

      const deletedTask = await Task.findOneAndDelete({
        _id: taskId,
        roomCode: cleanCode,
      });

      if (!deletedTask) {
        const errorMsg = 'Task not found or already deleted';
        if (typeof callback === 'function') callback({ error: errorMsg });
        return;
      }

      // If the deleted task was the active Pomodoro task, clear it from timer
      if (deletedTask.isPomodoroFocus) {
        setRoomActiveTask(cleanCode, null);
        const timer = await getOrInitRoomTimer(cleanCode);
        const timerPayload = await formatTimerPayload(timer);
        io.to(cleanCode).emit('timer:state', timerPayload);
      }

      // Broadcast deletion to all members
      io.to(cleanCode).emit('task:delete', { roomCode: cleanCode, taskId });

      if (typeof callback === 'function') {
        callback({ success: true, taskId });
      }
    } catch (error) {
      console.error('[task:delete] Error:', error.message);
      if (typeof callback === 'function') callback({ error: error.message });
    }
  });
};
