import { Server } from 'socket.io';
import { socketAuth } from './socketAuth.js';
import { registerRoomHandlers } from './roomHandler.js';
import { registerWhiteboardHandlers } from './whiteboard.js';
import { registerTimerHandlers } from './timer.js';

import { registerNotesHandlers } from './notesHandler.js';
import { registerChatHandlers } from './chat.js';
import { registerTasksHandlers } from './tasks.js';

/**
 * Initialize Socket.io with HTTP server and configure events
 * @param {import('http').Server} httpServer
 * @param {string} clientUrl
 * @returns {Server}
 */
export const initSocketServer = (httpServer, clientUrl) => {
  const allowedOrigins = clientUrl
    ? clientUrl.split(',').map((origin) => origin.trim())
    : ['http://localhost:5173'];

  const io = new Server(httpServer, {
    cors: {
      origin: allowedOrigins.length === 1 ? allowedOrigins[0] : allowedOrigins,
      methods: ['GET', 'POST'],
      credentials: true,
    },
    pingTimeout: 60000,
  });

  // Enforce JWT authentication on socket handshake
  io.use(socketAuth);

  io.on('connection', (socket) => {
    console.log(
      `[Socket Connected] ID: ${socket.id} | User: ${socket.user?.name} (${socket.user?.email})`
    );

    // Register Phase 1 Room & Presence Handlers
    registerRoomHandlers(io, socket);

    // Register Phase 2 Whiteboard & Pomodoro Timer Handlers
    registerWhiteboardHandlers(io, socket);
    registerTimerHandlers(io, socket);

    // Register Phase 3 Collaborative Realtime Notes Handlers
    registerNotesHandlers(io, socket);

    // Register Room Chat Handlers
    registerChatHandlers(io, socket);

    // Register Shared Tasks Handlers
    registerTasksHandlers(io, socket);
  });

  return io;
};
