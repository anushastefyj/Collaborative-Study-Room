import { Server } from 'socket.io';
import { socketAuth } from './socketAuth.js';
import { registerRoomHandlers } from './roomHandler.js';

// Modular handler placeholders for future phases:
// import { registerWhiteboardHandlers } from './whiteboardHandler.js'; // Phase 2
// import { registerTimerHandlers } from './timerHandler.js'; // Phase 2
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

    // --- Future Phase Handlers (extensible architecture) ---
    // registerWhiteboardHandlers(io, socket); // Phase 2: Collaborative Whiteboard
    // registerTimerHandlers(io, socket);      // Phase 2: Shared Pomodoro / Study Timer
    // registerNotesHandlers(io, socket);      // Phase 3: Collaborative Realtime Notes
  });

  return io;
};
