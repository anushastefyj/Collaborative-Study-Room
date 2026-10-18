import { Server } from 'socket.io';
import { socketAuth } from './socketAuth.js';
import { registerRoomHandlers } from './roomHandler.js';
import { registerWhiteboardHandlers } from './whiteboard.js';
import { registerTimerHandlers } from './timer.js';

// Modular handler placeholders for future phases:
// import { registerNotesHandlers } from './notesHandler.js'; // Phase 3

/**
 * Initialize Socket.io with HTTP server and configure events
 * @param {import('http').Server} httpServer
 * @param {string} clientUrl
 * @returns {Server}
 */
export const initSocketServer = (httpServer, clientUrl) => {
  const io = new Server(httpServer, {
    cors: {
      origin: clientUrl || 'http://localhost:5173',
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

    // --- Future Phase Handlers ---
    // registerNotesHandlers(io, socket); // Phase 3: Collaborative Realtime Notes
  });

  return io;
};
