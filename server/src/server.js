import http from 'http';
import dotenv from 'dotenv';
import app from './app.js';
import { connectDB } from './config/db.js';
import { initSocketServer } from './sockets/index.js';

// Load environment variables
dotenv.config();

// Connect to MongoDB
await connectDB();

const PORT = process.env.PORT || 5000;
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';
const allowedOrigins = CLIENT_URL.split(',').map((u) => u.trim());

// Create HTTP Server & initialize Socket.io
const httpServer = http.createServer(app);
initSocketServer(httpServer, CLIENT_URL);

// Start Server
httpServer.listen(PORT, () => {
  console.log(`[Server] Collaborative Study Room server running on port ${PORT}`);
  console.log(`[Server] CORS configured for client URLs: ${allowedOrigins.join(', ')}`);
});
